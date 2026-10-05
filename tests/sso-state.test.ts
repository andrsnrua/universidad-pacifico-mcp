import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ssoCookies } from '../src/blackboard/auth/sso-state.js';

test('the remembered Microsoft session excludes Blackboard cookies and anything already expired', () => {
  const now = Math.floor(Date.now() / 1000);
  const kept = ssoCookies([
    { name: 'JSESSIONID', value: 'x', domain: 'aulavirtual.up.edu.pe', path: '/' },
    { name: 'BbRouter', value: 'x', domain: '.aulavirtual.up.edu.pe', path: '/' },
    { name: 'ESTSAUTH', value: 'x', domain: 'login.microsoftonline.com', path: '/', expires: -1 },
    { name: 'ESTSAUTHLIGHT', value: 'x', domain: 'login.microsoftonline.com', path: '/' },
    { name: 'fpc', value: 'x', domain: 'login.microsoftonline.com', path: '/', expires: now + 3600 },
    { name: 'stale', value: 'x', domain: 'login.microsoftonline.com', path: '/', expires: now - 1 },
  ]);
  assert.deepEqual(kept.map(c => c.name), ['ESTSAUTH', 'ESTSAUTHLIGHT', 'fpc']);
});
