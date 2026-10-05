import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadSession } from '../src/blackboard/auth/session.js';

test('a cookie valid for another ten minutes remains usable until its actual expiry', (t) => {
  let expiresAt = Date.now() + 10 * 60_000;
  t.mock.method(fs, 'existsSync', () => true);
  t.mock.method(fs, 'lstatSync', () => ({ isSymbolicLink: () => false }));
  t.mock.method(fs, 'chmodSync', () => {});
  t.mock.method(fs, 'readFileSync', () => JSON.stringify({ expiresAt, cookies: [{ name: 'JSESSIONID', value: 'fixture', domain: 'aulavirtual.up.edu.pe' }] }));
  assert.equal(loadSession()?.expiresAt, expiresAt);
  expiresAt = Date.now() - 1;
  assert.equal(loadSession(), null);
});
