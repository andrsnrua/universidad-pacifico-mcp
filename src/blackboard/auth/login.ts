import fs from 'fs';
import type { BrowserContext, Page } from 'playwright';
import type { Session, Cookie } from '../types.js';
import { blackboardCookies, parseBbRouter, saveSession, SESSION_TTL_FALLBACK_MS } from './session.js';
import { loadSsoState, saveSsoState } from './sso-state.js';
import { launchPersistentContextSafe } from '../../runtime/browser.js';
import lockfile from 'proper-lockfile';
import { BLACKBOARD_BASE_URL as BASE_URL, BLACKBOARD_HOST, BLACKBOARD_LOGIN_URL, PROFILE_DIR } from '../config.js';


export interface LoginOptions {
  headless?: boolean;
  timeout?: number;
}

export class SilentLoginFailed extends Error {
  constructor(reason: string, public code = 'SESSION_UNAVAILABLE') {
    super(`Silent re-login failed: ${reason}`);
    this.name = 'SilentLoginFailed';
  }
}

// Hold the profile lock for the entire browser lifetime, including across CLI/MCP processes.
let loginTail: Promise<unknown> = Promise.resolve();
function withLoginProfile<T>(operation: () => Promise<T>): Promise<T> {
  const work = loginTail.catch(() => {}).then(async () => {
    ensureProfileDir();
    const release = await lockfile.lock(PROFILE_DIR, {
      realpath: false, stale: 600_000, update: 10_000,
      retries: { retries: 60, minTimeout: 500, maxTimeout: 1_000 },
    });
    try { return await operation(); } finally { await release(); }
  });
  loginTail = work.catch(() => {});
  return work;
}

async function needsInteraction(page: Page): Promise<boolean> {
  return page.locator('input[type="email"], input[type="password"], #idDiv_SAOTCS_Proofs, #idDiv_SAOTCC_Description, #idDiv_SAOTCAS_Description, #otherTile').first().isVisible().catch(() => false);
}

function extractBbRouterExpiry(cookies: Cookie[]): number {
  const router = parseBbRouter(cookies.find(c => c.name === 'BbRouter')?.value);
  const now = Date.now();
  // Sanity check: must be a future timestamp within 24 hours
  if (router.expiresAt && router.expiresAt > now && router.expiresAt < now + 24 * 60 * 60 * 1000) return router.expiresAt;
  return now + SESSION_TTL_FALLBACK_MS;
}

// UP's /users/me omits `userName` at the root. The display name must be
// assembled from `name.given` + `name.family`, falling back to `studentId`.
export function resolveDisplayName(userData: any): string | undefined {
  if (!userData) return undefined;
  if (typeof userData.userName === 'string' && userData.userName.trim()) return userData.userName.trim();
  const full = [userData?.name?.given, userData?.name?.family].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (userData?.name?.preferredDisplayName && typeof userData.name.preferredDisplayName === 'string') {
    const pdn = userData.name.preferredDisplayName.trim();
    if (pdn && pdn !== 'GivenName' && pdn !== 'FamilyName') return pdn;
  }
  return userData.studentId || undefined;
}

// Microsoft SSO persistence is controlled specifically by ESTSAUTHPERSIST
// (set when the user accepts "Keep me signed in"). Other cookies on
// login.microsoftonline.com like MUID/fpc are tracking and persist ~1 year
// but don't keep the user signed in — ignore them.
const SSO_COOKIE_NAMES = new Set(['ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT', 'ESTSAUTH']);

export function getSsoExpiry(cookies: Cookie[]): number | undefined {
  const ssoCookies = cookies.filter(c =>
    SSO_COOKIE_NAMES.has(c.name) &&
    (c.domain.includes('login.microsoftonline.com') || c.domain.includes('login.live.com'))
  );
  const now = Date.now();
  const future = ssoCookies
    .map(c => c.expires)
    .filter((e): e is number => typeof e === 'number' && e > 0)
    .map(e => e * 1000)
    .filter(ms => ms > now);
  if (future.length === 0) return undefined;
  return Math.max(...future);
}

/**
 * Keeps whatever Microsoft handed the browser, persistent or not. Best effort: a failure here
 * must never undo a sign-in that has already succeeded.
 */
function rememberSso(cookies: Cookie[]): void {
  if (process.env.UP_MCP_REMEMBER_SSO !== '1') return;
  try {
    const kept = saveSsoState(cookies);
    if (kept) console.error(`Sesión de Microsoft conservada (${kept} cookies) para renovar cuando el proveedor lo permita.`);
  } catch (err: any) {
    console.error(`No se pudo conservar la sesión de Microsoft: ${err?.message ?? err}`);
  }
}

/** Re-seats the remembered Microsoft session in a fresh context, so the redirect sees a known browser. */
async function restoreSso(context: BrowserContext): Promise<number> {
  if (process.env.UP_MCP_REMEMBER_SSO !== '1') return 0;
  const state = loadSsoState();
  if (!state || state.cookies.length === 0) return 0;
  const cookies = state.cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    expires: typeof cookie.expires === 'number' ? cookie.expires : -1,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: (['Strict', 'Lax', 'None'].includes(cookie.sameSite as string) ? cookie.sameSite : 'Lax') as 'Strict' | 'Lax' | 'None',
  }));
  try {
    await context.addCookies(cookies);
    return cookies.length;
  } catch {
    // One malformed cookie would reject the whole batch; add them one by one and keep what sticks.
    let added = 0;
    for (const cookie of cookies) {
      try { await context.addCookies([cookie]); added += 1; } catch {}
    }
    return added;
  }
}

function extractXsrf(cookies: Cookie[]): string {
  return parseBbRouter(cookies.find(c => c.name === 'BbRouter')?.value).xsrf ?? '';
}

function ensureProfileDir(): void {
  if (fs.existsSync(PROFILE_DIR) && fs.lstatSync(PROFILE_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to use a browser profile through a symbolic link: ${PROFILE_DIR}`);
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(PROFILE_DIR, 0o700);
}

export function isBlackboardUltraUrl(value: string | URL): boolean {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return url.protocol === 'https:'
      && url.hostname === BLACKBOARD_HOST
      && (url.pathname === '/ultra' || url.pathname.startsWith('/ultra/'));
  } catch {
    return false;
  }
}

async function waitForAuthenticatedUser(
  context: BrowserContext,
  page: Page,
  timeout: number,
): Promise<{ cookies: Cookie[]; userData: any }> {
  const deadline = Date.now() + timeout;
  do {
    const cookies = (await context.cookies()).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));
    const blackboardSession = blackboardCookies(cookies);
    const hasSessionCookie = blackboardSession.some(
      cookie => cookie.name === 'JSESSIONID' || cookie.name === 'BbRouter',
    );
    if (hasSessionCookie) {
      const cookieHeader = blackboardSession.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
      try {
        const response = await page.request.get(`${BASE_URL}/learn/api/public/v1/users/me`, {
          headers: { Accept: 'application/json', Cookie: cookieHeader },
          timeout: 10_000,
        });
        if (response.ok()) {
          const userData = await response.json();
          if (userData?.id) return { cookies, userData };
        }
      } catch {
        // Login pages may create Blackboard cookies before authentication is
        // complete. Keep polling until /users/me confirms the real session.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  throw new Error('Tiempo agotado esperando que Aula Virtual confirme el inicio de sesión');
}

export async function login(opts: LoginOptions = {}): Promise<Session> {
  return withLoginProfile(() => loginExclusive(opts));
}

async function loginExclusive(opts: LoginOptions): Promise<Session> {
  const { headless = false, timeout = 5 * 60_000 } = opts;

  ensureProfileDir();

  const context = await launchPersistentContextSafe(PROFILE_DIR, {
    headless,
  });

  const page = await context.newPage();

  try {
    console.error('Abriendo Aula Virtual UP. Completa el inicio de sesión en la ventana del navegador...');
    // Restauración opcional de una sesión que Microsoft todavía acepte.
    await restoreSso(context);
    await page.goto(BLACKBOARD_LOGIN_URL, { waitUntil: 'commit', timeout });
    const { cookies, userData } = await waitForAuthenticatedUser(context, page, timeout);

    // Extract XSRF token from BbRouter cookie
    let nonce = extractXsrf(cookies);

    // Fallback: try meta tag in the page. Best effort — if the window is gone by now the cookies
    // are still good, and a missing nonce is recoverable where a lost session is not.
    if (!nonce) {
      nonce = await page.evaluate(() => {
        const metaXsrf = document.querySelector<HTMLMetaElement>(
          'meta[name="blackboard.platform.security.NonceUtil.nonce"]'
        )?.content;
        if (metaXsrf) return metaXsrf;
        const allCookies = document.cookie.split(';').reduce<Record<string, string>>((acc, c) => {
          const [k, v] = c.trim().split('=');
          acc[k] = v;
          return acc;
        }, {});
        return allCookies['XSRF-TOKEN'] || '';
      }).catch(() => '');
    }

    const displayName = resolveDisplayName(userData);

    const session: Session = {
      cookies: blackboardCookies(cookies),
      xsrfToken: nonce,
      userId: userData?.id,
      userName: displayName,
      expiresAt: extractBbRouterExpiry(cookies),
      ssoExpiresAt: getSsoExpiry(cookies),
    };

    saveSession(session);
    rememberSso(cookies);
    console.error(`✓ Sesión UP iniciada como ${displayName || 'usuario autenticado'}`);

    return session;
  } catch (error: any) {
    if (headless && await needsInteraction(page)) error.code = 'AUTH_REQUIRED';
    throw error;
  } finally {
    await context.close();
  }
}

export async function silentRelogin(previousSession?: Session | null): Promise<Session> {
  if (!fs.existsSync(PROFILE_DIR)) {
    throw new SilentLoginFailed('No browser profile — run up-mcp login first', 'AUTH_REQUIRED');
  }
  return withLoginProfile(() => silentReloginExclusive(previousSession));
}

async function silentReloginExclusive(previousSession?: Session | null): Promise<Session> {
  if (fs.lstatSync(PROFILE_DIR).isSymbolicLink()) {
    throw new SilentLoginFailed('Browser profile is a symbolic link; run up-mcp logout and login again');
  }
  fs.chmodSync(PROFILE_DIR, 0o700);

  let context;
  try {
    context = await launchPersistentContextSafe(PROFILE_DIR, {
      headless: true,
    });
  } catch (err: any) {
    throw new SilentLoginFailed(`Could not open browser profile: ${err.message}`);
  }

  const page = await context.newPage();

  try {
    await restoreSso(context);
    await page.goto(BLACKBOARD_LOGIN_URL, { waitUntil: 'commit', timeout: 20_000 });
    const { cookies, userData } = await waitForAuthenticatedUser(context, page, 20_000);
    rememberSso(cookies);

    const userId = userData?.id ?? previousSession?.userId;
    const userName = resolveDisplayName(userData) ?? previousSession?.userName;

    const session: Session = {
      cookies: blackboardCookies(cookies),
      xsrfToken: extractXsrf(cookies),
      userId,
      userName,
      expiresAt: extractBbRouterExpiry(cookies),
      ssoExpiresAt: getSsoExpiry(cookies),
    };

    saveSession(session);
    return session;
  } catch (err: any) {
    if (err instanceof SilentLoginFailed) throw err;
    throw new SilentLoginFailed(err.message ?? 'No se pudo comprobar la sesión', await needsInteraction(page) ? 'AUTH_REQUIRED' : 'SESSION_UNAVAILABLE');
  } finally {
    await context.close();
  }
}
