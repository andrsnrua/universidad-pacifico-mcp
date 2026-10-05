import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import type { Session } from '../types.js';
import { BLACKBOARD_HOST, PROFILE_DIR, SESSION_DIR } from '../config.js';
import { clearSsoState } from './sso-state.js';

const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
// Proactive renewal belongs to the connection manager; reads retain all valid session time.

/**
 * Marks a session object as the one on disk, so cookie rollover knows it may write it back.
 *
 * Fixture sessions built by tests, and the empty placeholder the `status` command uses, carry no
 * mark and are never persisted — rolling them would overwrite the student's real session with
 * garbage. `Symbol.for` so every copy of this module (CLI, MCP, the desktop app requiring `dist`)
 * agrees on the same key; enumerable so `{ ...session }` copies keep it; a symbol so JSON never
 * sees it.
 */
export const PERSISTED = Symbol.for('upacifico-mcp.blackboard.session.persisted');
function markPersisted(session: Session): Session {
  Object.defineProperty(session, PERSISTED, { value: true, enumerable: true, configurable: true, writable: true });
  return session;
}
export function isPersisted(session: Session | null | undefined): boolean {
  return Boolean(session && (session as any)[PERSISTED]);
}

export function blackboardCookies(cookies: Session['cookies']): Session['cookies'] {
  const host = BLACKBOARD_HOST;
  return cookies.filter((cookie) => {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  });
}

export function saveSession(session: Session): void {
  if (fs.existsSync(SESSION_DIR) && fs.lstatSync(SESSION_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to store credentials through a symbolic link: ${SESSION_DIR}`);
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(SESSION_DIR, 0o700);

  const sanitized = { ...session, cookies: blackboardCookies(session.cookies) };
  const temporary = `${SESSION_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(sanitized, null, 2), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, SESSION_FILE);
  fs.chmodSync(SESSION_FILE, 0o600);
  markPersisted(session);
}

export function loadSession(): Session | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    if (fs.lstatSync(SESSION_FILE).isSymbolicLink()) return null;
    fs.chmodSync(SESSION_FILE, 0o600);
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const session: Session = JSON.parse(raw);
    const filtered = blackboardCookies(session.cookies ?? []);
    if (filtered.length !== (session.cookies ?? []).length) {
      session.ssoExpiresAt ??= getLegacySsoExpiry(session.cookies ?? []);
      session.cookies = filtered;
      saveSession(session); // one-time migration from sessions that stored Microsoft cookies
    }
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      return null;
    }
    return markPersisted(session);
  } catch {
    return null;
  }
}

/**
 * What the BbRouter cookie says about the session it belongs to.
 *
 * Its value is a flat list — `expires:<unix s>,id:…,signature:…,site:…,timeout:<s>,user:…,v:2,
 * xsrf:<token>`. `timeout` is the inactivity window Blackboard applies (three hours at UP) and
 * `expires` is the moment the server last computed as "now + timeout"; every authenticated
 * response pushes it forward.
 */
export function parseBbRouter(value: string | undefined): { expiresAt?: number; timeoutMs?: number; xsrf?: string } {
  if (!value) return {};
  const out: { expiresAt?: number; timeoutMs?: number; xsrf?: string } = {};
  const expires = value.match(/(?:^|,)expires:(\d+)/);
  if (expires) out.expiresAt = parseInt(expires[1], 10) * 1000;
  const timeout = value.match(/(?:^|,)timeout:(\d+)/);
  if (timeout) out.timeoutMs = parseInt(timeout[1], 10) * 1000;
  const xsrf = value.match(/(?:^|,)xsrf:([a-f0-9-]+)/);
  if (xsrf) out.xsrf = xsrf[1];
  return out;
}

export const SESSION_TTL_FALLBACK_MS = 3 * 60 * 60 * 1000; // BbRouter timeout:10800 at UP
/** A write per response would be wasteful; the file only needs to move when the horizon really does. */
const ROLL_PERSIST_STEP_MS = 60_000;
const VOLATILE_COOKIES = new Set(['BbRouter', 'AWSALB', 'AWSALBCORS']);

/** One `Set-Cookie` header line, parsed just far enough to be stored as a session cookie. */
export function parseSetCookie(header: string, defaultDomain = BLACKBOARD_HOST): (Session['cookies'][number] & { expired: boolean }) | null {
  const [pair, ...attributes] = header.split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;
  const cookie: Session['cookies'][number] & { expired: boolean } = { name, value, domain: defaultDomain, path: '/', expired: false };
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split('=');
    const key = rawKey.trim().toLowerCase();
    const raw = rest.join('=').trim();
    if (key === 'domain' && raw) cookie.domain = raw.toLowerCase();
    else if (key === 'path' && raw) cookie.path = raw;
    else if (key === 'max-age' && /^-?\d+$/.test(raw)) {
      const seconds = parseInt(raw, 10);
      if (seconds <= 0) cookie.expired = true;
      else cookie.expires = Math.floor(Date.now() / 1000) + seconds;
    } else if (key === 'expires' && raw && cookie.expires === undefined) {
      const at = Date.parse(raw);
      if (!Number.isNaN(at)) {
        cookie.expires = Math.floor(at / 1000);
        if (at <= Date.now()) cookie.expired = true;
      }
    } else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'samesite' && raw) cookie.sameSite = raw;
  }
  return cookie;
}

/**
 * Keeps the stored session in step with the one the server is actually holding.
 *
 * Blackboard's session dies after three hours *without a request*, not three hours after login.
 * The old code computed `expiresAt` once, at login, and never looked again: a student whose app
 * had been talking to Aula Virtual every five minutes was told the session had "vencido" exactly
 * three hours after signing in, while the server still considered it alive. Every authenticated
 * response now does two things — cookies the server re-issued (BbRouter with a later `expires`,
 * a rotated JSESSIONID, the load-balancer's AWSALB) replace the stored ones, and the horizon moves
 * to whatever is later: the server's own `expires`, or this response's time plus the inactivity
 * window. A session that keeps being used therefore never expires locally either.
 *
 * Only Blackboard-host cookies are ever kept. Mutates `session` in place so the client's headers
 * and the file see the same cookies, and writes the file only if the session came from it.
 */
export function rollSession(
  session: Session,
  setCookies: string[] | undefined,
  options: { activity?: boolean; now?: number } = {},
): { changed: boolean; expiresAtMovedMs: number } {
  const now = options.now ?? Date.now();
  const previousExpiresAt = session.expiresAt;
  let cookiesChanged = false;
  // BbRouter and the load balancer's cookies change on nearly every response; the file need not
  // chase them. A new JSESSIONID, or any other cookie, is written straight away.
  let identityChanged = false;
  const cookies = [...(session.cookies ?? [])];
  for (const header of setCookies ?? []) {
    const parsed = parseSetCookie(header);
    if (!parsed) continue;
    const { expired, ...cookie } = parsed;
    if (blackboardCookies([cookie]).length === 0) continue;
    // Blackboard keeps several JSESSIONIDs apart by path (/, /learn/api, /webapps/api-gateway).
    // They are different cookies; matching by name alone would let one overwrite another.
    const index = cookies.findIndex((existing) => existing.name === cookie.name && (existing.path || '/') === (cookie.path || '/'));
    if (expired) {
      if (index >= 0) { cookies.splice(index, 1); cookiesChanged = true; identityChanged = true; }
      continue;
    }
    if (index >= 0) {
      if (cookies[index].value === cookie.value) continue;
      cookies[index] = { ...cookies[index], ...cookie };
    } else {
      cookies.push(cookie);
    }
    cookiesChanged = true;
    if (!VOLATILE_COOKIES.has(cookie.name)) identityChanged = true;
  }
  if (cookiesChanged) session.cookies = cookies;

  const router = parseBbRouter(cookies.find((cookie) => cookie.name === 'BbRouter')?.value);
  if (router.xsrf && router.xsrf !== session.xsrfToken) session.xsrfToken = router.xsrf;
  let horizon = session.expiresAt ?? 0;
  // The server's own figure wins when it is sane; a clock skew of hours would otherwise be trusted.
  if (router.expiresAt && router.expiresAt > now && router.expiresAt < now + 24 * 60 * 60_000) horizon = Math.max(horizon, router.expiresAt);
  if (options.activity) horizon = Math.max(horizon, now + (router.timeoutMs ?? SESSION_TTL_FALLBACK_MS));
  session.expiresAt = horizon;

  const expiresAtMovedMs = session.expiresAt - (previousExpiresAt ?? 0);
  const changed = cookiesChanged || expiresAtMovedMs !== 0;
  if (changed && isPersisted(session) && (identityChanged || expiresAtMovedMs >= ROLL_PERSIST_STEP_MS)) {
    try { saveSession(session); } catch { /* the in-memory session is already right; the next roll retries the file */ }
  }
  return { changed, expiresAtMovedMs };
}

function getLegacySsoExpiry(cookies: Session['cookies']): number | undefined {
  const names = new Set(['ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT', 'ESTSAUTH']);
  const now = Date.now();
  const values = cookies
    .filter((cookie) => names.has(cookie.name) && /login\.(microsoftonline|live)\.com$/.test(cookie.domain.replace(/^\./, '')))
    .map((cookie) => (cookie.expires ?? 0) * 1000)
    .filter((expiry) => expiry > now);
  return values.length ? Math.max(...values) : undefined;
}

export function clearSession(opts: { keepProfile?: boolean } = {}): void {
  if (fs.existsSync(SESSION_DIR) && fs.lstatSync(SESSION_DIR).isSymbolicLink()) {
    throw new Error('La carpeta de sesión no puede ser un enlace simbólico.');
  }
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  if (!opts.keepProfile) {
    clearBrowserProfile();
    clearSsoState();
  }
}

export function clearBrowserProfile(): void {
  const root = path.resolve(SESSION_DIR);
  const profile = path.resolve(PROFILE_DIR);
  if (path.relative(root, profile) !== 'browser-profile') {
    throw new Error('El perfil no está dentro de la carpeta de sesión.');
  }
  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) {
    throw new Error('La carpeta de sesión no puede ser un enlace simbólico.');
  }
  if (!fs.existsSync(profile)) return;
  if (fs.lstatSync(profile).isSymbolicLink()) fs.unlinkSync(profile);
  else fs.rmSync(profile, { recursive: true, force: true });
}

export function isSessionValid(session: Session | null): boolean {
  if (!session) return false;
  if (Date.now() > session.expiresAt) return false;
  // JSESSIONID or BbRouter are sufficient for REST API calls
  const hasCriticalCookies =
    session.cookies.some(c => c.name === 'JSESSIONID') ||
    session.cookies.some(c => c.name === 'BbRouter');
  return hasCriticalCookies;
}

/**
 * Guards against relaunching a browser for every caller.
 *
 * A silent relogin starts a headless Chromium and waits up to twenty seconds. The desktop watcher
 * asks for the session on every cycle, so an expired session used to mean a fresh browser every
 * couple of minutes, each one paying the full timeout before failing the same way. Concurrent
 * callers now share one attempt, and a failed attempt is not retried until the cooldown passes —
 * the reason for the failure (SSO expired, no network) does not change in seconds.
 */
let reloginInFlight: Promise<Session | null> | null = null;
let reloginBlockedUntil = 0;
let reloginFailure: unknown = null;
const RELOGIN_COOLDOWN_MS = 5 * 60 * 1000;
/** The JSESSIONID the server last rejected, so dead cookies are not re-offered on every cycle. */
let rejectedSessionId: string | null = null;

/** Exposed so a deliberate action by the student is never made to wait out the cooldown. */
export function clearReloginCooldown(): void {
  reloginBlockedUntil = 0;
  reloginFailure = null;
  rejectedSessionId = null;
}

function sessionIdentity(session: Session | null): string | null {
  return session?.cookies?.find((cookie) => cookie.name === 'JSESSIONID')?.value ?? null;
}

/**
 * Whether the cookies on disk still open a session on the server, whatever the local clock says.
 *
 * This is the step that used to be missing. The local horizon is an estimate; the server is the
 * truth. Asking it costs one small request, where the alternative — a headless browser replaying
 * Microsoft sign-in — costs twenty seconds and, for a tenant that demands MFA on every fresh
 * sign-in, fails every time. Returns the (rolled, saved) session when it is alive, `null` when the
 * server rejected it, and throws only when the question could not be asked at all (offline).
 */
async function confirmWithServer(candidate: Session | null): Promise<Session | null> {
  if (!candidate) return null;
  const identity = sessionIdentity(candidate);
  const hasCookies = candidate.cookies?.some((cookie) => cookie.name === 'JSESSIONID' || cookie.name === 'BbRouter');
  if (!hasCookies || (identity && identity === rejectedSessionId)) return null;
  const { probeSession } = await import('./keepalive.js');
  const alive = await probeSession(candidate);
  if (alive === null) rejectedSessionId = identity;
  return alive;
}

export async function loadOrRefreshSession(options: { force?: boolean } = {}): Promise<Session | null> {
  // 1. Session still valid — return directly
  const session = loadSession();
  if (session !== null && !options.force) return session;
  if (reloginInFlight) return reloginInFlight;

  // 2. Locally expired, or a forced check — read the raw file. Its cookies may well still work,
  //    and even when they do not, its userId/userName carry over to the silent refresh.
  let storedSession: Session | null = session;
  if (!storedSession) {
    try {
      storedSession = markPersisted(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')));
    } catch {}
  }

  reloginInFlight = (async () => {
    try {
      // 3. Ask the server before opening any browser. Also skips the cooldown on purpose: the
      //    cooldown protects against repeated browser launches, and this is not one.
      try {
        const confirmed = await confirmWithServer(storedSession);
        if (confirmed) {
          reloginBlockedUntil = 0;
          reloginFailure = null;
          return confirmed;
        }
      } catch (err) {
        // Could not reach Aula Virtual at all. Nothing is known about the session; a browser would
        // fare no better, and a session that still has time on the clock must not be discarded.
        if (session !== null) return session;
        reloginBlockedUntil = Date.now() + RELOGIN_COOLDOWN_MS;
        reloginFailure = err;
        throw err;
      }

      if (!options.force && Date.now() < reloginBlockedUntil) {
        if (reloginFailure) throw reloginFailure;
        return null;
      }

      // 4. Dead on the server — a real renewal.
      // Dynamic import to avoid circular dependency (login.ts imports from session.ts)
      const { silentRelogin, SilentLoginFailed } = await import('./login.js');
      try {
        const renewed = await silentRelogin(storedSession);
        reloginBlockedUntil = 0;
        reloginFailure = null;
        rejectedSessionId = null;
        return renewed;
      } catch (err) {
        reloginBlockedUntil = Date.now() + RELOGIN_COOLDOWN_MS;
        if (err instanceof SilentLoginFailed && err.code === 'AUTH_REQUIRED') { reloginFailure = null; return null; }
        reloginFailure = err;
        throw err;
      }
    } finally {
      reloginInFlight = null;
    }
  })();
  return reloginInFlight;
}

/**
 * How long the current session has left, so the app can renew ahead of time instead of noticing
 * the expiry only when a download fails.
 */
export function sessionLifetime(): { expiresAt: number | null; ssoExpiresAt: number | null; msRemaining: number | null; timeoutMs: number } {
  let raw: Session | null = null;
  try { raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')); } catch {}
  const expiresAt = raw?.expiresAt ?? null;
  return {
    expiresAt,
    ssoExpiresAt: raw?.ssoExpiresAt ?? null,
    msRemaining: expiresAt === null ? null : expiresAt - Date.now(),
    // The inactivity window the server itself declared, so callers stop hardcoding three hours.
    timeoutMs: parseBbRouter(raw?.cookies?.find((cookie) => cookie.name === 'BbRouter')?.value).timeoutMs ?? SESSION_TTL_FALLBACK_MS,
  };
}
