import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { exportAttendance, exportBrief, exportMultiAgenda, exportMultiGrades, exportOutline, exportReceipts } from '../src/blackboard/services/student-exports.js';
const courseId = '_101_1', userId = '_9_1', since = '2026-10-05T00:00:00Z', until = '2026-10-12T00:00:00Z';
function temporary(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-student-exports-')), previous = process.env.UP_MCP_DOWNLOAD_DIR; process.env.UP_MCP_DOWNLOAD_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR; else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    const rel = path.relative(os.tmpdir(), root); if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) fs.rmSync(root, { recursive: true, force: true }); }); return root;
}
function fixture(restricted = false): AxiosInstance {
  return { get: async (url: string) => {
    if (restricted && url.includes('_102_1')) throw Object.assign(new Error('synthetic-private-value'), { response: { status: 403 } });
    if (/\/courses\/_\d+_1$/.test(url)) return { data: { id: courseId, name: '=CourseName' } };
    const results = url.endsWith('/attempts') ? [{ id: '_4_1', userId, status: 'Completed', attemptReceipt: { receiptId: '@Receipt', submissionTotalSize: 0 } }]
      : url.endsWith('/meetings') ? [{ id: '_2_1', courseId }, { id: '_3_1', courseId }]
      : url.includes('/meetings/users/') ? [{ meetingId: '_2_1', userId, status: 'Present' }, { meetingId: '_99_1', userId, status: 'Absent' }]
      : url.endsWith('/columns') ? [{ id: '_5_1', name: '=ColumnName', grading: { type: 'Attempts', due: '2026-10-07T00:00:00Z' } }]
      : url.includes('/gradebook/users/') ? [{ columnId: '_5_1', userId, score: 0 }]
      : url.endsWith('/contents') ? [{ id: '_6_1', title: 'Sílabo', reviewable: false, contentHandler: { id: 'resource/x-bb-folder' } }]
      : []; return { data: { results } };
  } } as unknown as AxiosInstance;
}
test('agenda múltiple conserva dos secciones con el mismo nombre e ID de actividad', async t => {
  temporary(t); const file = await exportMultiAgenda(fixture(), [courseId, '_102_1'], since, until); const body = fs.readFileSync(file.destination, 'utf8');
  assert.equal(file.eventCount, 2); assert.equal(new Set(body.match(/UID:[^\r]+/g)).size, 2); assert(body.includes('_101_1')); assert(body.includes('_102_1'));
});
test('exportación de asistencia no mezcla cursos ni convierte ausencia de registro en falta', async t => {
  temporary(t); const file = await exportAttendance(fixture(), courseId, { id: userId }); const body = fs.readFileSync(file.destination, 'utf8');
  assert.equal(file.rowCount, 2); assert(body.includes('Present')); assert(!body.includes('Absent')); assert(body.includes('false'));
});
test('comprobantes exportados neutralizan fórmulas y preservan tamaño cero', async t => {
  temporary(t); const file = await exportReceipts(fixture(), courseId, '_5_1', userId); const body = fs.readFileSync(file.destination, 'utf8');
  assert(body.includes("'@Receipt")); assert(body.includes('"0"')); assert.equal(file.rowCount, 1);
});
test('estructura JSON y resumen Markdown se guardan en la biblioteca privada con referencias', async t => {
  const root = temporary(t); const outline = await exportOutline(fixture(), courseId); const brief = await exportBrief(fixture(), courseId, since, until);
  assert(path.relative(root, outline.destination).startsWith('exports')); assert.equal(JSON.parse(fs.readFileSync(outline.destination, 'utf8')).courseId, courseId);
  assert(fs.readFileSync(brief.destination, 'utf8').includes('_6_1')); assert.equal(brief.complete, true);
});
test('notas de varias secciones preservan ceros y neutralizan texto de columnas y cursos', async t => {
  temporary(t); const file = await exportMultiGrades(fixture(), [courseId, '_102_1'], userId); const body = fs.readFileSync(file.destination, 'utf8');
  assert.equal(file.rowCount, 2); assert(body.includes("'=CourseName")); assert(body.includes("'=ColumnName")); assert(body.includes('"0"')); assert.equal(file.calculatedFinalGrade, false);
});
test('copias múltiples parciales requieren opt-in y declaran cursos restringidos', async t => {
  const root = temporary(t); await assert.rejects(exportMultiGrades(fixture(true), [courseId, '_102_1'], userId), /incompleta/);
  assert(!fs.existsSync(path.join(root, 'exports'))); const file = await exportMultiGrades(fixture(true), [courseId, '_102_1'], userId, { allowPartial: true });
  assert.equal(file.complete, false); assert.equal(file.rowCount, 1); assert.equal(file.warnings[0].status, 403); assert(!JSON.stringify(file).includes('synthetic-private-value'));
});
