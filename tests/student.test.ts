import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../src/mcp/tools/index.js';
import { announcement, calendarEvent, gradePeriods, institutionAnnouncements, visibleCalendars } from '../src/blackboard/api/student.js';
import { courseGradebook, courseOutline, multiAnnouncementSearch, multiContentSearch, multiGradebook, multiOverview, reviewSummary, selectedCourses, studyBrief, submissionReceipts } from '../src/blackboard/services/student.js';
import { assignmentFeedback } from '../src/blackboard/services/course-workflows.js';
const courseId = '_101_1', userId = '_9_1', base = `/learn/api/public/v1/courses/${courseId}`;
const page = (results: any[]) => ({ results });
const denied = () => Object.assign(new Error('synthetic-private-value'), { response: { status: 403 }, config: { headers: { Cookie: 'synthetic-private-value' } } });
const fixture = (load: (url: string, params: any) => any) => ({ get: async (url: string, options?: any) => ({ data: await load(url, options?.params ?? {}) }) }) as unknown as AxiosInstance;
test('consultas nuevas usan las rutas oficiales y preservan booleanos falsos', async () => {
  const calls: string[] = [];
  const client = fixture((url, params) => { calls.push(url); if (url.endsWith('/announcements')) { assert.equal(params.includeExpired, false); return page([]); } return url.includes('/items/') || url.endsWith('/_2_1') ? { id: '_2_1' } : page([]); });
  await institutionAnnouncements(client, { title: 'Aviso', includeExpired: false }); await visibleCalendars(client);
  await calendarEvent(client, 'Personal', 'event-uuid'); await announcement(client, courseId, '_2_1'); await gradePeriods(client, courseId);
  assert.deepEqual(calls, ['/learn/api/public/v1/announcements', '/learn/api/public/v1/calendars', '/learn/api/public/v1/calendars/items/Personal/event-uuid', `${base}/announcements/_2_1`, `${base}/gradebook/periods`]);
});
test('estructura limita recorrido y preserva rutas, false y tipos de contenido', async () => {
  const client = fixture(url => url === base ? { id: courseId } : url.endsWith('/children') ? page([{ id: '_3_1', title: 'Texto', reviewable: false }]) : page([{ id: '_2_1', title: 'Carpeta', hasChildren: true, contentHandler: { id: 'folder' } }]));
  const data = await courseOutline(client, courseId); assert.deepEqual(data.results[1].path, ['Carpeta', 'Texto']); assert.equal(data.results[1].reviewable, false);
  assert.equal(data.complete, true); const capped = await courseOutline(client, courseId, { maxItems: 1 }); assert.equal(capped.truncated, true); assert.equal(capped.results.length, 1);
});
test('estructura detecta ciclos y no convierte permisos en estructura vacía completa', async () => {
  const client = fixture(url => url === base ? {} : page([{ id: '_2_1', hasChildren: true }])); const data = await courseOutline(client, courseId);
  assert.equal(data.results.length, 1); assert.equal(data.complete, false); assert.equal(data.warnings.length, 1);
  const restricted = await courseOutline(fixture(url => { if (url === base) return {}; throw denied(); }), courseId);
  assert.equal(restricted.complete, false); assert(!JSON.stringify(restricted).includes('synthetic-private-value'));
});
test('búsqueda entre cursos comparte presupuesto global y declara cursos no consultados', async () => {
  let calls = 0; const client = fixture(() => { calls++; return page([{ id: '_2_1', title: 'Lectura' }, { id: '_3_1', title: 'Lectura' }]); });
  const data = await multiContentSearch(client, [courseId, '_102_1'], 'lectura', { maxItems: 1, maxResults: 2 });
  assert.equal(data.visited, 1); assert.equal(data.results.length, 1); assert.equal(data.courses[1].searched, false); assert.equal(data.complete, false); assert.equal(calls, 1);
});
test('anuncios entre secciones conservan identidad y errores sanitizados', async () => {
  const client = fixture(url => { if (url.includes('_102_1')) throw denied(); return page([{ id: '_2_1', title: 'Evaluación', body: 'Fecha' }]); });
  const data = await multiAnnouncementSearch(client, [courseId, '_102_1'], 'evaluacion fecha');
  assert.equal(data.results[0].courseId, courseId); assert.equal(data.courses[1].searched, false); assert.equal(data.complete, false); assert(!JSON.stringify(data).includes('synthetic-private-value'));
});
test('comprobantes conservan valores cero y ausencia sin inferir entregas', async () => {
  const data = await submissionReceipts(fixture(() => page([{ id: '_2_1', userId, status: 'Completed', attemptReceipt: { receiptId: 'fictional', submissionTotalSize: 0 } }, { id: '_3_1', userId }])), courseId, '_4_1', userId);
  assert.equal(data.results[0].receipt.submissionTotalSize, 0); assert.equal(data.results[1].receipt, null);
  await assert.rejects(submissionReceipts(fixture(() => page([{ id: '_2_1', userId: '_99_1' }])), courseId, '_4_1', userId), /otra cuenta/);
});
test('resumen de revisión consulta únicamente contenidos revisables y preserva false', async () => {
  const calls: string[] = []; const client = fixture(url => { calls.push(url); if (url === base) return {}; if (url.endsWith('/contents')) return page([{ id: '_2_1', reviewable: true }, { id: '_3_1', reviewable: false }, { id: '_4_1' }]); if (url.endsWith('/reviewStatus')) return { userId, reviewed: false }; return { id: '_2_1', reviewable: true }; });
  const data = await reviewSummary(client, courseId, userId); assert.equal(data.counts.unreviewed, 1); assert.equal(data.counts.unknownOrUnsupported, 2);
  assert.equal(calls.filter(url => url.endsWith('/reviewStatus')).length, 1);
});
test('libro de notas conserva cero, displayGrade y columnas sin nota', async () => {
  const client = fixture(url => url === base ? { id: courseId, name: 'Sección ficticia' } : url.endsWith('/columns') ? page([{ id: '_2_1', gradebookCategoryId: '_5_1' }, { id: '_3_1' }]) : url.endsWith('/categories') ? page([{ id: '_5_1', title: 'Actividad' }]) : page([{ userId, columnId: '_2_1', score: 0, displayGrade: { text: 'Publicado' } }]));
  const data = await courseGradebook(client, courseId, userId); assert.equal(data.results[0].grade.score, 0); assert.equal(data.results[0].category.title, 'Actividad'); assert.equal(data.results[1].grade, null); assert.equal(data.calculatedFinalGrade, false);
});
test('libro de notas rechaza otra cuenta, duplicados y fallo de fuente primaria', async () => {
  await assert.rejects(courseGradebook(fixture(url => url === base ? {} : page([{ userId: '_99_1', columnId: '_2_1' }])), courseId, userId), /otra cuenta/);
  await assert.rejects(courseGradebook(fixture(url => url === base ? {} : page([{ columnId: '_2_1' }, { columnId: '_2_1' }])), courseId, userId), /duplicada/);
  await assert.rejects(courseGradebook(fixture(url => { if (url === base) return {}; throw denied(); }), courseId, userId));
});
test('consultas múltiples deduplican IDs y preservan secciones fallidas con null', async () => {
  const client = fixture(url => { if (url.includes('_102_1')) throw denied(); if (url === base) return { name: 'Mismo nombre' }; return page([]); });
  const grades = await multiGradebook(client, [courseId, courseId, '_102_1'], userId); assert.equal(grades.courses.length, 2); assert.equal(grades.courses[1].gradebook, null);
  const overview = await multiOverview(client, [courseId, '_102_1'], userId); assert.equal(overview.courses[1].overview, null); assert.equal(overview.complete, false);
  assert.throws(() => selectedCourses(['../outside'])); assert.throws(() => selectedCourses(Array.from({ length: 11 }, (_, i) => `_${i}_1`)));
});
test('resumen de estudio conserva fuentes y no presenta candidato como sílabo verificado', async () => {
  const client = fixture(url => url === base ? { name: 'Curso ficticio' } : url.endsWith('/contents') ? page([{ id: '_2_1', title: 'Sílabo', contentHandler: { id: 'resource/x-bb-folder' } }]) : page([]));
  const data = await studyBrief(client, courseId, '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z');
  assert(data.markdown.includes('Posibles sílabos')); assert(data.markdown.includes('_2_1')); assert.equal(data.complete, true);
});
test('retroalimentación no consulta archivos sin petición y conserva comentarios', async () => {
  const client = fixture(url => { if (url.endsWith('/columns')) return page([{ id: '_2_1', grading: { type: 'Attempts' } }]); assert(url.endsWith('/attempts')); return page([{ id: '_3_1', instructorFeedback: 'Comentario ficticio' }]); });
  const data = await assignmentFeedback(client, courseId); assert.equal(data.complete, true); assert.equal((data.results[0] as any).attemptFilesRequested, false);
});
test('las consultas propias fijan la cuenta autenticada y las herramientas locales no requieren sesión', async () => {
  const handlers = new Map<string, any>(); let requested = 0;
  const client = fixture(url => { if (url.endsWith('/users/me')) return { id: userId }; return page([]); });
  registerTools({ registerTool: (name: string, config: any, handler: any) => handlers.set(name, { config, handler }) } as unknown as McpServer,
    async () => { requested++; return { client, session: {} as any }; });
  assert.equal(handlers.size, 70); assert(!('userId' in handlers.get('blackboard_get_submission_receipts').config.inputSchema));
  await handlers.get('blackboard_get_submission_receipts').handler({ courseId, columnId: '_2_1' }); assert.equal(requested, 1);
  assert.equal(handlers.get('blackboard_read_downloaded_material').config.annotations.readOnlyHint, true);
  assert.equal(handlers.get('blackboard_export_multi_course_agenda').config.annotations.readOnlyHint, false);
});
