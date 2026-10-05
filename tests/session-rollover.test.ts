import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import axios from 'axios';
import { createClient } from '../src/blackboard/api/client.js';
import { parseBbRouter, parseSetCookie, rollSession } from '../src/blackboard/auth/session.js';
import { probeSession } from '../src/blackboard/auth/keepalive.js';
import type { Session } from '../src/blackboard/types.js';
import { SESSION_DIR } from '../src/blackboard/config.js';

const HOST = 'aulavirtual.up.edu.pe';
const H = 60 * 60_000;

function bbRouter(expiresAtMs: number, xsrf = 'aaaa-1111'): string {
  return `expires:${Math.floor(expiresAtMs / 1000)},id:abc,signature:sig,site:s1,timeout:10800,user:u1,v:2,xsrf:${xsrf}`;
}

function fixture(now: number): Session {
  return {
    cookies: [
      { name: 'JSESSIONID', value: 'J1', domain: HOST, path: '/' },
      { name: 'BbRouter', value: bbRouter(now + 3 * H), domain: HOST, path: '/' },
    ],
    xsrfToken: 'aaaa-1111',
    expiresAt: now + 3 * H,
  };
}

test('parseBbRouter reads expiry, inactivity window and xsrf', () => {
  const at = 1_800_000_000_000;
  assert.deepEqual(parseBbRouter(bbRouter(at, 'dead-beef')), { expiresAt: at, timeoutMs: 3 * H, xsrf: 'dead-beef' });
  assert.deepEqual(parseBbRouter(undefined), {});
});

test('parseSetCookie keeps what a session needs and flags deletions', () => {
  const cookie = parseSetCookie('BbRouter=v; Path=/; Secure; HttpOnly; SameSite=None');
  assert.equal(cookie?.name, 'BbRouter');
  assert.equal(cookie?.domain, HOST);
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.expired, false);
  assert.equal(parseSetCookie('gone=; Max-Age=0')?.expired, true);
  assert.equal(parseSetCookie('nonsense')?.name, undefined);
});

test('a re-issued BbRouter moves the local horizon to the server\'s figure', () => {
  const now = 1_800_000_000_000;
  const session = fixture(now);
  const later = now + 2 * H;
  const result = rollSession(session, [`BbRouter=${bbRouter(later + 3 * H, 'bbbb-2222')}; Path=/; Secure`], { now: later });
  assert.equal(result.changed, true);
  assert.equal(session.expiresAt, later + 3 * H, 'horizon should follow the server');
  assert.equal(session.xsrfToken, 'bbbb-2222', 'the xsrf token travels inside BbRouter');
  assert.equal(session.cookies.find(c => c.name === 'BbRouter')?.value, bbRouter(later + 3 * H, 'bbbb-2222'));
});

test('activity alone slides the horizon by the inactivity window, never backwards', () => {
  const now = 1_800_000_000_000;
  const session = fixture(now);
  rollSession(session, undefined, { activity: true, now: now + H });
  assert.equal(session.expiresAt, now + 4 * H);
  // An older answer replayed from memory must not pull the horizon back.
  rollSession(session, undefined, { activity: true, now: now + 30 * 60_000 });
  assert.equal(session.expiresAt, now + 4 * H);
  // Without activity nothing moves.
  const before = session.expiresAt;
  assert.equal(rollSession(session, undefined, { now: now + 2 * H }).changed, false);
  assert.equal(session.expiresAt, before);
});

test('a rotated JSESSIONID replaces the old one; foreign cookies are ignored', () => {
  const now = 1_800_000_000_000;
  const session = fixture(now);
  rollSession(session, [
    'JSESSIONID=J2; Path=/; HttpOnly',
    'ESTSAUTH=secret; Domain=login.microsoftonline.com; Path=/',
    'AWSALB=node7; Expires=Sat, 26 Sep 2099 19:59:06 GMT; Path=/',
  ], { now });
  assert.equal(session.cookies.find(c => c.name === 'JSESSIONID')?.value, 'J2');
  assert.equal(session.cookies.some(c => c.name === 'ESTSAUTH'), false, 'Microsoft cookies never enter the session file');
  assert.equal(session.cookies.find(c => c.name === 'AWSALB')?.value, 'node7');
});

test('an implausible server expiry (clock skew) is not trusted', () => {
  const now = 1_800_000_000_000;
  const session = fixture(now);
  rollSession(session, [`BbRouter=${bbRouter(now + 48 * H)}`], { now });
  assert.equal(session.expiresAt, now + 3 * H);
  rollSession(session, [`BbRouter=${bbRouter(now - H)}`], { now });
  assert.equal(session.expiresAt, now + 3 * H);
});

/** Stands in for Aula Virtual: answers /users/me and re-issues BbRouter like the real one. */
async function fakeAulaVirtual(behaviour: { status?: number; setCookie?: string[]; onRequest?: (cookie: string) => void }) {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    behaviour.onRequest?.(String(req.headers.cookie ?? ''));
    const headers: Record<string, string | string[]> = { 'content-type': 'application/json' };
    if (behaviour.setCookie) headers['set-cookie'] = behaviour.setCookie;
    res.writeHead(behaviour.status ?? 200, headers);
    res.end(JSON.stringify(behaviour.status && behaviour.status !== 200 ? { status: behaviour.status } : { id: '_42_1', userName: 'ana' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, hits: () => hits, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('the client sends the cookies the server handed back, not the ones it started with', async () => {
  const now = Math.floor(Date.now() / 1000) * 1000; // BbRouter carries whole seconds
  const session = fixture(now);
  const seen: string[] = [];
  const server = await fakeAulaVirtual({
    setCookie: ['JSESSIONID=J2; Path=/; HttpOnly', `BbRouter=${bbRouter(now + 5 * H, 'cccc-3333')}; Path=/`],
    onRequest: (cookie) => seen.push(cookie),
  });
  try {
    const client = createClient(session, { paceKey: `roll-${now}` });
    client.defaults.baseURL = `http://127.0.0.1:${server.port}`;
    await client.get('/learn/api/public/v1/users/me', { noReuse: true } as any);
    await client.get('/learn/api/public/v1/users/me', { noReuse: true } as any);
    assert.match(seen[0], /JSESSIONID=J1/);
    assert.match(seen[1], /JSESSIONID=J2/, 'the second request should carry the rotated id');
    assert.equal(client.defaults.headers['X-Blackboard-XSRF'], 'cccc-3333');
    assert.equal(session.expiresAt, now + 5 * H);
    assert.equal(server.hits(), 2, 'noReuse must reach the server every time');
  } finally {
    await server.close();
  }
});

test('probeSession confirms a locally expired session the server still accepts', async () => {
  const now = Date.now();
  const session = fixture(now - 4 * H); // expired by the local clock an hour ago
  const server = await fakeAulaVirtual({ setCookie: [`BbRouter=${bbRouter(now + 3 * H)}; Path=/`] });
  const restore = pointClientsAt(server.port);
  try {
    const alive = await probeSession(session);
    assert.ok(alive, 'the server said yes; the local clock was wrong');
    assert.ok(alive!.expiresAt > now + 2 * H, 'and the horizon moved forward');
    assert.equal(alive!.userId, '_42_1');
  } finally {
    restore();
    await server.close();
  }
});

test('probeSession reports rejection as null and unreachability as an error', async () => {
  const now = Date.now();
  const rejecting = await fakeAulaVirtual({ status: 401 });
  let restore = pointClientsAt(rejecting.port);
  try {
    assert.equal(await probeSession(fixture(now)), null);
  } finally {
    restore();
    await rejecting.close();
  }
  restore = pointClientsAt(1); // nothing listens on port 1
  try {
    await assert.rejects(probeSession(fixture(now), 2_000), (err: any) => err.code === 'SESSION_UNAVAILABLE');
  } finally {
    restore();
  }
});

test('unexpected HTTP replies retain their status and are not classified as network failures', async () => {
  for (const status of [404, 503]) {
    const server = await fakeAulaVirtual({ status });
    const restore = pointClientsAt(server.port);
    try {
      await assert.rejects(probeSession(fixture(Date.now())), (err: any) => err.code === 'SESSION_UNAVAILABLE' && err.status === status);
    } finally {
      restore();
      await server.close();
    }
  }
});

/** probeSession builds its own client, so the redirect to the fake server goes through axios defaults. */
function pointClientsAt(port: number): () => void {
  const original = axios.create;
  axios.create = ((config: any) => original.call(axios, { ...config, baseURL: `http://127.0.0.1:${port}` })) as typeof axios.create;
  return () => { axios.create = original; };
}

test('a session the local clock calls expired is confirmed with the server, not with a browser', async (t) => {
  const fs = await import('node:fs');
  const { loadOrRefreshSession, clearReloginCooldown } = await import('../src/blackboard/auth/session.js');
  const now = Math.floor(Date.now() / 1000) * 1000;
  const stored = fixture(now - 4 * H);
  const writes: string[] = [];
  const sessionFile = path.join(SESSION_DIR, 'session.json');
  const original = { ...fs.default };
  const ownPath = (value: any) => typeof value === 'string' && (value === SESSION_DIR || value === sessionFile || value.startsWith(`${sessionFile}.`));
  // Only replace session I/O: mocking every read also corrupts tsx's lazy module loading on Linux.
  for (const method of ['existsSync', 'lstatSync', 'chmodSync', 'mkdirSync', 'readFileSync', 'writeFileSync', 'renameSync'] as const) {
    t.mock.method(fs.default, method, (...args: any[]) => {
      if (!ownPath(args[0])) return (original[method] as any)(...args);
      if (method === 'existsSync') return true;
      if (method === 'lstatSync') return { isSymbolicLink: () => false };
      if (method === 'readFileSync') return JSON.stringify(stored);
      if (method === 'writeFileSync') writes.push(String(args[1]));
      return undefined;
    });
  }
  const server = await fakeAulaVirtual({ setCookie: [`BbRouter=${bbRouter(now + 3 * H)}; Path=/`] });
  const restore = pointClientsAt(server.port);
  clearReloginCooldown();
  try {
    const session = await loadOrRefreshSession();
    assert.ok(session, 'the cookies still worked, so no renewal was needed');
    assert.ok(session!.expiresAt >= now + 3 * H && session!.expiresAt < now + 3 * H + 10_000, `horizon ${session!.expiresAt} should sit three hours out`);
    assert.equal(server.hits(), 1);
    assert.equal(writes.length, 1, 'the corrected horizon is written back');
    assert.equal(JSON.parse(writes[0]).expiresAt, session!.expiresAt);
  } finally {
    restore();
    await server.close();
    clearReloginCooldown();
  }
});

test('JSESSIONIDs on different paths are different cookies; a rotation touches only its own', () => {
  const now = 1_800_000_000_000;
  const session = fixture(now);
  session.cookies.unshift({ name: 'JSESSIONID', value: 'GW1', domain: HOST, path: '/webapps/api-gateway' });
  session.cookies.push({ name: 'JSESSIONID', value: 'API1', domain: HOST, path: '/learn/api' });
  rollSession(session, ['JSESSIONID=API2; Path=/learn/api; Secure'], { now });
  const byPath = Object.fromEntries(session.cookies.filter(c => c.name === 'JSESSIONID').map(c => [c.path, c.value]));
  assert.deepEqual(byPath, { '/webapps/api-gateway': 'GW1', '/': 'J1', '/learn/api': 'API2' });
});
