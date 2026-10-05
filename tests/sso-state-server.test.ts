import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A server-like run: its own session folder, and not Windows. Set before the module is loaded,
// because the session folder is read once at import.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-sso-'));
process.env.UP_MCP_SESSION_DIR = dir;
Object.defineProperty(process, 'platform', { value: 'linux' });

const load = () => import('../src/blackboard/auth/sso-state.js');

const cookies = [{ name: 'ESTSAUTH', value: 'secret-value', domain: 'login.microsoftonline.com', path: '/', expires: -1 }];
const file = path.join(dir, 'sso-state.bin');

test('without a server key nothing about the Microsoft session is written', async () => {
  const { saveSsoState, loadSsoState } = await load();
  delete process.env.UP_MCP_SECRET_KEY;
  assert.equal(saveSsoState(cookies), 0);
  assert.equal(fs.existsSync(file), false);
  assert.equal(loadSsoState(), null);
});

test('with a server key the file is sealed, never plain, and reads back', async () => {
  const { saveSsoState, loadSsoState } = await load();
  process.env.UP_MCP_SECRET_KEY = 'una-clave-de-prueba-bastante-larga';
  assert.equal(saveSsoState(cookies), 1);
  const raw = fs.readFileSync(file);
  assert.equal(raw.includes(Buffer.from('secret-value')), false, 'the cookie value is not in the file');
  assert.equal(raw.includes(Buffer.from('ESTSAUTH')), false);
  assert.deepEqual(loadSsoState()?.cookies.map((cookie) => cookie.value), ['secret-value']);
  process.env.UP_MCP_SECRET_KEY = 'otra-clave-distinta-igual-de-larga';
  assert.equal(loadSsoState(), null, 'the wrong key opens nothing');
});

test('a plain file left by the old fallback is not trusted', async () => {
  const { loadSsoState } = await load();
  process.env.UP_MCP_SECRET_KEY = 'una-clave-de-prueba-bastante-larga';
  fs.writeFileSync(file, JSON.stringify({ savedAt: Date.now(), cookies }));
  assert.equal(loadSsoState(), null);
});

test('sealing is authenticated: a changed byte is refused', async () => {
  const { sealWithSecret, openWithSecret } = await load();
  const sealed = sealWithSecret(Buffer.from('hola'), 'clave-suficientemente-larga');
  assert.equal(openWithSecret(sealed, 'clave-suficientemente-larga').toString(), 'hola');
  sealed[sealed.length - 1] ^= 1;
  assert.throws(() => openWithSecret(sealed, 'clave-suficientemente-larga'));
});
