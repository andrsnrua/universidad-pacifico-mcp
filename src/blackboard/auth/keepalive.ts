import type { Session } from '../types.js';
import { createClient } from '../api/client.js';
import { isSessionValid, loadSession, rollSession } from './session.js';

/** No conclusive auth response: a transport failure or an unexpected HTTP response. */
export class SessionUnreachable extends Error {
  code = 'SESSION_UNAVAILABLE';
  /** The HTTP status when Aula Virtual did answer, just not with yes or no (a 404, a 5xx). */
  status: number | null;
  constructor(cause: unknown) {
    super(`No se pudo contactar con Aula Virtual para comprobar la sesión (${(cause as any)?.message ?? cause})`);
    this.name = 'SessionUnreachable';
    this.status = Number((cause as any)?.response?.status) || null;
  }
}

const PROBE_PATH = '/learn/api/public/v1/users/me';

/**
 * Asks the server whether these cookies still open a session, and if so keeps them current.
 *
 * `/users/me` is the cheapest authenticated call Blackboard has, and answering it counts as
 * activity — the three-hour inactivity clock starts over. The response's cookies roll into
 * `candidate` (and onto disk, if that is where it came from), so the local horizon tracks the
 * server's. Resolves with the live session, `null` when the server rejected the cookies, and
 * rejects with {@link SessionUnreachable} on a transport failure or unexpected HTTP response.
 */
export async function probeSession(candidate: Session, timeoutMs = 15_000): Promise<Session | null> {
  const client = createClient(candidate);
  try {
    const response = await client.get(PROBE_PATH, { timeout: timeoutMs, noReuse: true } as any);
    if (!response.data?.id) return null;
    if (!candidate.userId) candidate.userId = response.data.id;
    return candidate;
  } catch (err: any) {
    if (err?.code === 'SESSION_EXPIRED') return null;
    const status = err?.response?.status;
    if (status === 403) return null;
    throw new SessionUnreachable(err);
  }
}

export type KeepAliveResult =
  | { alive: true; expiresAt: number; extendedMs: number }
  | { alive: false; reason: 'no_session' | 'rejected' };

/**
 * The heartbeat: one small request that keeps the session from ever going idle.
 *
 * Meant to run on a timer far shorter than the inactivity window (every ten minutes against three
 * hours). Activity prevents idle expiry; the server can still impose an absolute lifetime or
 * revoke the session. Rejected cookies are reported, not
 * acted on: deciding whether to reopen Microsoft is the connection manager's call.
 */
export async function keepAlive(): Promise<KeepAliveResult> {
  const session = loadSession();
  if (!isSessionValid(session)) return { alive: false, reason: 'no_session' };
  const before = session!.expiresAt;
  const alive = await probeSession(session!);
  if (!alive) return { alive: false, reason: 'rejected' };
  return { alive: true, expiresAt: alive.expiresAt, extendedMs: alive.expiresAt - before };
}

export { rollSession };
