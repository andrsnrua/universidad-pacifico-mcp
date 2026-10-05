import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ssoCookies } from '../src/blackboard/auth/sso-state.js';
import { assertSameOrigin } from '../src/blackboard/api/client.js';

test('el estado SSO no conserva cookies de sitios ajenos a Microsoft', () => {
  const cookies = ssoCookies([
    { name: 'auth', value: 'synthetic', domain: 'login.microsoftonline.com', path: '/' },
    { name: 'tracking', value: 'synthetic', domain: 'example.test', path: '/' },
    { name: 'lookalike', value: 'synthetic', domain: 'microsoftonline.com.attacker.test', path: '/' },
  ]);
  assert.deepEqual(cookies.map(cookie => cookie.name), ['auth']);
});

test('URLs con credenciales incrustadas se rechazan incluso en el host de la UP', () => {
  assert.throws(() => assertSameOrigin('https://user:pass@aulavirtual.up.edu.pe/learn/api/public/v1/users/me'));
});
