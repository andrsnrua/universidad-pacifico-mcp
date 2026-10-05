import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { readAllPages } from '../src/blackboard/api/pagination.js';

test('las colecciones incluyen los elementos posteriores a la primera página', async () => {
  const offsets: number[] = [];
  const client = { get: async (url: string, { params }: any) => {
    assert.equal(url, '/learn/api/public/v1/example');
    assert.equal(params.filter, 'fixture');
    offsets.push(params.offset);
    return { data: { results: params.offset === 0 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }] } };
  } } as unknown as AxiosInstance;
  const { results } = await readAllPages<{ id: number }>(client, '/learn/api/public/v1/example', { filter: 'fixture' });
  assert.equal(results.length, 101);
  assert.deepEqual(offsets, [0, 100]);
});

test('una respuesta incompleta no se transforma en una lista vacía', async () => {
  const client = { get: async () => ({ data: {} }) } as unknown as AxiosInstance;
  await assert.rejects(readAllPages(client, '/learn/api/public/v1/example'), /colección inválida/);
});

test('el paginado tiene un límite y no sigue links arbitrarios', async () => {
  let calls = 0;
  const client = { get: async (url: string) => {
    assert.equal(url, '/learn/api/public/v1/example');
    calls++;
    return { data: { results: Array.from({ length: 100 }, () => ({})), paging: { nextPage: 'https://attacker.test' } } };
  } } as unknown as AxiosInstance;
  await assert.rejects(readAllPages(client, '/learn/api/public/v1/example'), /10 000/);
  assert.equal(calls, 100);
});

test('una página vacía con continuación se rechaza en vez de repetir el mismo offset', async () => {
  const client = { get: async () => ({ data: { results: [], paging: { nextPage: '?offset=0' } } }) } as unknown as AxiosInstance;
  await assert.rejects(readAllPages(client, '/learn/api/public/v1/example'), /sin devolver elementos/);
});
