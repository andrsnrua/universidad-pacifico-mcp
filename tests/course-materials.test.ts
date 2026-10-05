import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { downloadWholeCourse } from '../src/downloads/course-materials.js';

function fixtureClient(name: string, failContents = false): AxiosInstance {
  return { get: async (url: string) => {
    if (url.endsWith('/contents')) {
      if (failContents) throw Object.assign(new Error('Acceso denegado de prueba'), { response: { status: 403 } });
      return { data: { results: [] } };
    }
    if (url.endsWith('/gradebook/columns')) return { data: { results: [] } };
    if (/\/courses\/_\d+_1$/.test(url)) return { data: { id: url.split('/').at(-1), name } };
    throw new Error(`Petición inesperada al fixture: ${url}`);
  } } as unknown as AxiosInstance;
}

function fixtureRoot(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-course-'));
  const previous = process.env.UP_MCP_DOWNLOAD_DIR;
  process.env.UP_MCP_DOWNLOAD_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR;
    else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    const relative = path.relative(os.tmpdir(), root);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('secciones con el mismo nombre conservan carpetas y manifiestos separados', async t => {
  fixtureRoot(t);
  const longName = 'Asignatura de ejemplo '.repeat(15);
  const first = await downloadWholeCourse(fixtureClient(longName), '_101_1');
  const second = await downloadWholeCourse(fixtureClient(longName), '_202_1');
  assert.notEqual(first.directory, second.directory);
  assert(first.directory.includes('_101_1'));
  assert(second.directory.includes('_202_1'));
  assert.equal(JSON.parse(fs.readFileSync(first.manifestPath, 'utf8')).course.id, '_101_1');
  assert.equal(JSON.parse(fs.readFileSync(second.manifestPath, 'utf8')).course.id, '_202_1');
  assert.equal(first.complete, true);
  assert.equal(second.complete, true);
});

test('un curso restringido genera un manifiesto incompleto que explica el fallo', async t => {
  fixtureRoot(t);
  const result = await downloadWholeCourse(fixtureClient('Curso ficticio', true), '_303_1');
  assert.equal(result.complete, false);
  assert.equal(result.failed.length, 1);
  assert(result.failed[0].error?.includes('Acceso denegado'));
  assert(fs.existsSync(result.manifestPath));
  assert.deepEqual(result.retired, []);
});

test('un archivo compatible cuyo endpoint desaparece no produce un manifiesto completo', async t => {
  fixtureRoot(t);
  const client = { get: async (url: string) => {
    if (url.endsWith('/contents')) return { data: { results: [{ id: '_2_1', title: 'Archivo', contentHandler: { id: 'resource/x-bb-file' } }] } };
    if (url.endsWith('/attachments')) throw Object.assign(new Error('Archivo de prueba no encontrado'), { response: { status: 404 } });
    if (url.endsWith('/gradebook/columns')) return { data: { results: [] } };
    return { data: { id: '_101_1', name: 'Curso ficticio' } };
  } } as unknown as AxiosInstance;
  const result = await downloadWholeCourse(client, '_101_1');
  assert.equal(result.complete, false); assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].source, 'attachment'); assert.deepEqual(result.retired, []);
});

test('las instrucciones de un contenido vinculado se guardan aunque la columna no tenga descripción', async t => {
  fixtureRoot(t);
  const client = { get: async (url: string) => {
    if (url.endsWith('/gradebook/columns')) return { data: { results: [{ id: '_4_1', name: 'Reflexión', contentId: '_5_1', grading: { type: 'Attempts' } }] } };
    if (url.endsWith('/contents') || url.endsWith('/attachments')) return { data: { results: [] } };
    if (url.endsWith('/contents/_5_1')) return { data: { contentHandler: { instructions: '<p>Escribe una reflexión sobre la lectura.</p>' } } };
    return { data: { id: '_101_1', name: 'Curso de prueba' } };
  } } as unknown as AxiosInstance;
  const result = await downloadWholeCourse(client, '_101_1');
  const document = result.downloaded.find(item => item.source === 'activity');
  assert(document?.saved);
  assert(fs.readFileSync(document.saved, 'utf8').includes('Escribe una reflexión sobre la lectura.'));
  assert.equal(result.complete, true);
});
