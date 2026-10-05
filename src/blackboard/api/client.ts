import axios, { AxiosInstance, AxiosError } from 'axios';
import { createHash } from 'node:crypto';
import path from 'path';
import type { Session } from '../types.js';
import { laneFor, paceFor } from './pace.js';
import { Reuse, isReusable, keyFor, reuseFor } from './reuse.js';
import { BLACKBOARD_BASE_URL, BLACKBOARD_HOST } from '../config.js';
import { rollSession } from '../auth/session.js';

const BASE_URL = BLACKBOARD_BASE_URL;
const ALLOWED_HOST = BLACKBOARD_HOST;
/** When the university actually answered; absent on anything that never left this process. */
const ANSWERED_AT = Symbol('answeredAt');

// Axios attaches the instance's default headers — including the session Cookie
// and X-Blackboard-XSRF token — even when a request URL is absolute and points
// at a different host entirely, bypassing baseURL. A caller-controlled URL
// (bbcswebdav links, blackboard_raw_api's path) must never be allowed to be
// absolute unless it targets this exact host, or the student's session leaks
// to whatever host was supplied.
export function assertSameOrigin(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url, BASE_URL);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' || parsed.host !== ALLOWED_HOST || parsed.username || parsed.password) {
    throw new Error(
      `Refusing to send the Blackboard session to a non-Blackboard host: ${parsed.hostname}`
    );
  }
}

export function assertPublicApiUrl(url: string): void {
  assertSameOrigin(url);
  const parsed = new URL(url, BASE_URL);
  if (!parsed.pathname.startsWith('/learn/api/public/')) {
    throw new Error('Raw API calls are restricted to /learn/api/public/ endpoints');
  }
}

export function assertBlackboardFileUrl(url: string): void {
  assertSameOrigin(url);
  const parsed = new URL(url, BASE_URL);
  if (!parsed.pathname.startsWith('/bbcswebdav/')) {
    throw new Error('Direct downloads are restricted to Blackboard /bbcswebdav/ URLs');
  }
}

// Server-reported filenames (Content-Disposition, Blackboard fileName) are untrusted —
// strip to a plain basename so a crafted name can't write outside `dir` (CWE-22).
// `.`/`..`/empty are rejected outright: path.basename('.') is '.', which would make
// dest === dir and crash writeFileSync with EISDIR instead of failing safely.
export function safeDestPath(dir: string, name: string): string {
  const base = path.basename(name);
  if (!base || base === '.' || base === '..') {
    throw new Error(`Refusing to write an unsafe filename: ${name}`);
  }
  const dest = path.join(dir, base);
  const rel = path.relative(dir, dest);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside output directory: ${name}`);
  }
  return dest;
}

export type ClientOptions = {
  /**
   * Identifies whose traffic this is, for processes serving several students.
   *
   * The CLI leaves it out: one process is one person. The hosted relay passes
   * the student's key so that one person's downloads never queue behind
   * another's, while each person still looks like a single browser.
   */
  paceKey?: string;
  /**
   * Shared short-term memory of GET responses.
   *
   * Passed in when several clients serve the same person, so rebuilding the
   * client does not throw away what we just asked. Defaults to a private one.
   */
  reuse?: Reuse;
};

function cookieHeader(session: Session): string {
  return (session.cookies ?? [])
    .filter((c) => {
      const domain = c.domain.replace(/^\./, '');
      return ALLOWED_HOST === domain || ALLOWED_HOST.endsWith(`.${domain}`);
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

export function createClient(session: Session, options: ClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: {
      Cookie: cookieHeader(session),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(session.xsrfToken ? { 'X-Blackboard-XSRF': session.xsrfToken } : {}),
    },
    withCredentials: true,
    beforeRedirect: (options) => {
      assertSameOrigin(`${options.protocol}//${options.hostname}${options.port ? `:${options.port}` : ''}${options.path ?? '/'}`);
    },
  });

  // The session is a living thing, not a snapshot. Blackboard re-issues BbRouter with a later
  // expiry on every authenticated response and its session dies only after three idle hours, so
  // a client that keeps sending login-time cookies and a login-time expiry is wrong about both
  // within minutes. Every successful response rolls the server's cookies into `session` (and
  // onto disk when that is where it came from) and refreshes this client's own headers, so the
  // next request carries whatever the server handed back — a rotated JSESSIONID included.
  client.interceptors.response.use((response) => {
    const setCookie = response.headers?.['set-cookie'];
    // A response replayed from the reuse memory is the same object, so its timestamp is the
    // moment the university really answered; rolling with that time is idempotent, whereas
    // "now" would credit activity that never reached the server.
    const answeredAt = (response as any)[ANSWERED_AT] as number | undefined;
    const rolled = rollSession(session, Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : undefined, {
      activity: response.status >= 200 && response.status < 300,
      now: answeredAt,
    });
    if (rolled.changed) {
      client.defaults.headers.Cookie = cookieHeader(session);
      if (session.xsrfToken) client.defaults.headers['X-Blackboard-XSRF'] = session.xsrfToken;
    }
    return response;
  });

  // Pacing goes on the adapter rather than on interceptors because the slot has
  // to come back however the request ends. An interceptor pair would have to
  // match each response to its request by hand, and any request that never
  // settled would hold its slot until the process exited.
  const identity = session.userId ?? createHash('sha256').update(cookieHeader(session)).digest('hex');
  const key = options.paceKey ?? `account:${identity}`;
  const pace = paceFor(key);
  const reuse = options.reuse ?? reuseFor(key);
  const base = axios.getAdapter(client.defaults.adapter);
  client.defaults.adapter = (config) => {
    // Central choke point: every request this client ever sends passes through
    // here, so this is where the session leaks if a URL slips through unchecked
    // — enforcing it at each call site instead has already missed one (the `campus
    // api` CLI command shipped without the guard that blackboard_raw_api got).
    const method = (config.method ?? 'get').toUpperCase();
    if (method !== 'GET') throw new Error('Solo se permite GET: este MCP no modifica Blackboard.');
    assertSameOrigin(config.url ?? '');
    const send = () => pace.run(laneFor(config), () => base(config)).then((response) => {
      Object.defineProperty(response, ANSWERED_AT, { value: Date.now(), enumerable: false });
      return response;
    });
    if (!isReusable(config)) {
      // A write invalidates everything we remember before it runs, so a reader
      // racing the write cannot repopulate the memory with the old answer.
      reuse.forget();
      return send();
    }
    // Reuse sits in front of pacing on purpose: an answer we already have costs
    // the university nothing and should not wait behind anyone's queue.
    return reuse.get(keyFor(config), send);
  };

  // Intercept 401 to give a helpful message
  client.interceptors.response.use(
    (r) => r,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        const e = new Error('Session expired. Run: up-mcp login');
        (e as any).code = 'SESSION_EXPIRED';
        throw e;
      }
      throw err;
    }
  );

  return client;
}
