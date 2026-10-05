import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { agendaIcs, exportCourseAgenda, exportCourseGrades, gradesCsv } from '../src/blackboard/services/exports.js';

const courseId = '_101_1', userId = '_9_1';
const since = '2026-10-05T00:00:00-05:00', until = '2026-10-12T00:00:00-05:00';
function temporaryRoot(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-export-'));
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

function fixture(fail?: 'calendar' | 'columns' | 'grades', feedback = '', owner = userId): AxiosInstance {
  return { get: async (url: string) => {
    const forbidden = () => { throw Object.assign(new Error('synthetic-private-token'), { response: { status: 403 } }); };
    if (url === `/learn/api/public/v1/courses/${courseId}`) return { data: { id: courseId, name: 'Economía' } };
    if (url.endsWith(`/gradebook/users/${userId}`)) {
      if (fail === 'grades') forbidden();
      return { data: { results: [{ columnId: '_5_1', userId: owner, score: 0, status: 'Graded', feedback }] } };
    }
    if (url.includes('/v2/') && url.endsWith('/gradebook/columns')) return { data: { results: [
      { id: '_5_1', name: 'Actividad', grading: { type: 'Attempts', due: '2026-10-07T14:00:00Z' } },
    ] } };
    if (url.endsWith('/gradebook/columns')) {
      if (fail === 'columns') forbidden();
      return { data: { results: [{ id: '_5_1', name: 'Actividad', score: { possible: 20 } }] } };
    }
    if (url.endsWith('/calendars/items')) {
      if (fail === 'calendar') forbidden();
      return { data: { results: [{ id: '_6_1', title: 'Sesión', start: '2026-10-06T14:00:00Z', end: '2026-10-06T15:00:00Z' }] } };
    }
    throw new Error(`Petición inesperada: ${url}`);
  } } as unknown as AxiosInstance;
}

function agenda(title = 'Evaluación'): any {
  return { courseId, course: { id: courseId, name: 'Economía' }, complete: true, events: [
    { source: 'assignment', id: '_5_1', title, start: '2026-10-07T09:00:00-05:00', end: null },
  ] };
}

// A small independent CSV reader checks quoted fields, commas and embedded newlines.
function readCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && char === '\r' && text[index + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; index++;
    } else field += char;
  }
  assert.equal(quoted, false); assert.equal(row.length, 0); assert.equal(field, '');
  return rows;
}

test('ICS contiene campos requeridos, fechas UTC y UID estable por fecha publicada', () => {
  const first = agendaIcs(agenda(), new Date('2026-10-05T12:00:00Z'));
  const second = agendaIcs(agenda(), new Date('2026-10-06T12:00:00Z'));
  const unfolded = first.replace(/\r\n[ \t]/g, '');
  assert(unfolded.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert(unfolded.endsWith('END:VCALENDAR\r\n'));
  assert(unfolded.includes('DTSTART:20261007T140000Z\r\n'));
  assert(unfolded.includes('DTSTAMP:20261005T120000Z\r\n'));
  assert(!unfolded.includes('DTEND:'));
  assert.equal(unfolded.match(/UID:([^\r]+)/)![1], second.replace(/\r\n[ \t]/g, '').match(/UID:([^\r]+)/)![1]);
});

test('ICS conserva Unicode, limita líneas a 75 bytes y neutraliza inyección de propiedades', () => {
  const title = 'Evaluación 🧠 áéíóú '.repeat(20) + '\r\nBEGIN:VEVENT\r\nATTENDEE:evil@example.test;uno,dos\\tres';
  const body = agendaIcs(agenda(title));
  for (const line of body.split('\r\n')) assert(Buffer.byteLength(line, 'utf8') <= 75);
  const unfolded = body.replace(/\r\n[ \t]/g, '');
  assert(unfolded.includes('Evaluación 🧠 áéíóú'));
  assert(unfolded.includes('\\nBEGIN:VEVENT\\nATTENDEE:evil@example.test\\;uno\\,dos\\\\tres'));
  assert.equal(unfolded.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert(!unfolded.split('\r\n').some(line => line.startsWith('ATTENDEE:')));
});

test('ICS elimina instancias idénticas y conserva las dos fuentes de un vencimiento', () => {
  const data = agenda();
  data.events.push({ ...data.events[0] }, { ...data.events[0], source: 'calendar', end: '2026-10-07T15:00:00Z' });
  const body = agendaIcs(data).replace(/\r\n[ \t]/g, '');
  assert.equal(body.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 2);
  assert(body.includes('DTEND:20261007T150000Z'));
  data.events[0].start = 'invalid';
  assert.throws(() => agendaIcs(data), /fecha válida/);
});

test('CSV distingue cero, nota ausente y campos de escala, y conserva comillas y saltos', () => {
  const rows = readCsv(gradesCsv({ id: courseId, name: 'Curso, "UP"' }, [
    { id: '_5_1', name: 'Actividad', score: { possible: 20 } }, { id: '_6_1', name: 'Sin nota' },
  ], [{ columnId: '_5_1', score: 0, displayGrade: { score: 0, possible: 100 }, exempt: false, feedback: '<p>Uno</p><p>Dos</p>' }]));
  const field = (row: string[], name: string) => row[rows[0].indexOf(name)];
  assert.equal(field(rows[1], 'course_name'), 'Curso, "UP"');
  assert.equal(field(rows[1], 'score'), '0'); assert.equal(field(rows[1], 'display_score'), '0');
  assert.equal(field(rows[1], 'column_possible'), '20'); assert.equal(field(rows[1], 'display_possible'), '100');
  assert.equal(field(rows[1], 'exempt'), 'false'); assert.equal(field(rows[1], 'feedback'), 'Uno\n\nDos');
  assert.equal(field(rows[2], 'score'), ''); assert.equal(field(rows[2], 'status'), '');
});

test('CSV neutraliza fórmulas de texto sin convertir un puntaje numérico negativo', () => {
  const rows = readCsv(gradesCsv({ id: courseId, name: '=SUM(1,2)' }, [{ id: '_5_1', name: ' \t@formula' }],
    [{ columnId: '_5_1', score: -1, text: '\t=HYPERLINK("https://example.test")', feedback: '+1+2' }]));
  const field = (name: string) => rows[1][rows[0].indexOf(name)];
  assert.equal(field('score'), '-1');
  for (const name of ['course_name', 'column_name', 'text', 'feedback']) assert(field(name).startsWith("'"));
});

test('CSV conserva notas sin metadatos de columna y rechaza notas ambiguas', () => {
  const rows = readCsv(gradesCsv({ id: courseId }, [], [{ columnId: '_5_1', score: 14 }]));
  assert.equal(rows[1][2], '_5_1'); assert.equal(rows[1][3], ''); assert.equal(rows[1][4], '14');
  assert.throws(() => gradesCsv({ id: courseId }, [], [{ score: 14 }]), /columnId válido/);
  assert.throws(() => gradesCsv({ id: courseId }, [], [{ columnId: '_5_1' }, { columnId: '_5_1' }]), /duplicadas/);
});

test('exportaciones se guardan dentro de la raíz, respetan subcarpetas y crean copias únicas', async t => {
  const root = temporaryRoot(t);
  const first = await exportCourseAgenda(fixture(), courseId, since, until);
  const firstBody = fs.readFileSync(first.destination, 'utf8');
  const second = await exportCourseAgenda(fixture(), courseId, since, until);
  const grades = await exportCourseGrades(fixture(), courseId, userId, { outputDir: 'mis-reportes' });
  assert.notEqual(first.destination, second.destination);
  assert.equal(fs.readFileSync(first.destination, 'utf8'), firstBody);
  assert.equal(path.dirname(first.destination), path.join(root, 'exports'));
  assert.equal(path.dirname(grades.destination), path.join(root, 'mis-reportes'));
  assert.equal(first.eventCount, 2); assert.equal(first.complete, true); assert.equal(first.synced, false);
  assert.equal(grades.rowCount, 1); assert.equal(grades.calculatedFinalGrade, false);
  assert.equal(readCsv(fs.readFileSync(grades.destination, 'utf8'))[1][4], '0');
});

test('agenda incompleta no produce archivo salvo allowPartial explícito', async t => {
  const root = temporaryRoot(t);
  await assert.rejects(exportCourseAgenda(fixture('calendar'), courseId, since, until), /allowPartial/);
  assert(!fs.existsSync(path.join(root, 'exports')));
  const result = await exportCourseAgenda(fixture('calendar'), courseId, since, until, { allowPartial: true });
  assert.equal(result.complete, false); assert.equal(result.warnings[0].status, 403);
  assert(fs.readFileSync(result.destination, 'utf8').includes('X-UP-MCP-COMPLETE:FALSE'));
  assert(!JSON.stringify(result).includes('synthetic-private-token'));
});

test('CSV incompleto exige opt-in y conserva la nota aunque falte el nombre de columna', async t => {
  const root = temporaryRoot(t);
  await assert.rejects(exportCourseGrades(fixture('columns'), courseId, userId), /allowPartial/);
  assert(!fs.existsSync(path.join(root, 'exports')));
  const result = await exportCourseGrades(fixture('columns'), courseId, userId, { allowPartial: true });
  assert.equal(result.complete, false); assert.equal(result.warnings[0].section, 'gradeColumns');
  const rows = readCsv(fs.readFileSync(result.destination, 'utf8'));
  assert.equal(rows[1][3], ''); assert.equal(rows[1][4], '0');
});

test('notas denegadas o asociadas a otra cuenta nunca generan un reporte vacío', async t => {
  const root = temporaryRoot(t);
  await assert.rejects(exportCourseGrades(fixture('grades'), courseId, userId, { allowPartial: true }));
  await assert.rejects(exportCourseGrades(fixture(undefined, '', '_99_1'), courseId, userId), /otra cuenta/);
  assert(!fs.existsSync(path.join(root, 'exports')));
});

test('exportaciones rechazan salida fuera de la raíz configurada', async t => {
  temporaryRoot(t);
  await assert.rejects(exportCourseGrades(fixture(), courseId, userId, { outputDir: '../../outside' }), /outside/);
});

test('una exportación mayor a 5 MiB se elimina sin dejar archivo final ni temporal', async t => {
  const root = temporaryRoot(t);
  await assert.rejects(exportCourseGrades(fixture(undefined, 'x'.repeat(6 * 1024 * 1024)), courseId, userId), /safety limit/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'exports')), []);
});
