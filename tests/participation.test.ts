import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../src/mcp/tools/index.js';
import { getDiscussion, getGroup, listDiscussions, listDiscussionMessages, listGroups, listGroupSets } from '../src/blackboard/api/participation.js';
import { contentReviewStatus, gradeDetail, multiCourseAgenda, ownAttendance, ownEnrollment } from '../src/blackboard/services/participation.js';

const courseId = '_101_1', userId = '_9_1', root = `/learn/api/public/v1/courses/${courseId}`;
const v2 = `/learn/api/public/v2/courses/${courseId}`;
const page = (results: any[]) => ({ results });
const denied = () => Object.assign(new Error('synthetic-private-value'), { response: { status: 403 }, config: { headers: { Cookie: 'synthetic-private-value' } } });
function fixture(load: (url: string, params: any) => any): AxiosInstance {
  return { get: async (url: string, options?: any) => ({ data: await load(url, options?.params ?? {}) }) } as unknown as AxiosInstance;
}

test('discusiones preservan filtros y paginan sobre el mismo endpoint', async () => {
  const calls: any[] = [];
  const client = fixture((url, params) => {
    assert.equal(url, `${root}/discussions`); calls.push(params);
    return params.offset === 0 ? { results: [{ id: '_2_1' }], paging: { nextPage: '/untrusted' } } : page([{ id: '_3_1' }]);
  });
  assert.equal((await listDiscussions(client, courseId, { title: 'Foro', gradable: false })).results.length, 2);
  assert.deepEqual(calls.map(call => call.offset), [0, 1]);
  calls.forEach(call => { assert.equal(call.title, 'Foro'); assert.equal(call.gradable, false); });
});

test('tema, mensajes y respuestas usan rutas de discusiones Ultra y conservan relaciones', async () => {
  const calls: string[] = [];
  const client = fixture((url, params) => {
    calls.push(url);
    if (url === `${root}/discussions/_2_1`) return { id: '_2_1', topic: { text: 'Tema ficticio' } };
    assert.equal(params.userId, userId); assert.equal(params.groupId, '_8_1'); assert.equal(params.status, 'Published');
    return page([{ id: '_3_1', parentId: '_4_1', threadId: '_5_1' }]);
  });
  assert.equal((await getDiscussion(client, courseId, '_2_1')).id, '_2_1');
  const options = { userId, groupId: '_8_1', status: 'Published' as const };
  assert.equal((await listDiscussionMessages(client, courseId, '_2_1', options)).results[0].threadId, '_5_1');
  await listDiscussionMessages(client, courseId, '_2_1', options, '_4_1');
  assert.deepEqual(calls, [`${root}/discussions/_2_1`, `${root}/discussions/_2_1/messages`, `${root}/discussions/_2_1/messages/_4_1/replies`]);
});

test('grupos usan v2, inGroupSet booleano y la ruta correcta groups/sets', async () => {
  const client = fixture((url, params) => {
    if (url === `${v2}/groups`) { assert.equal(params.nameCompare, 'contains'); assert.equal(params.inGroupSet, false); return page([{ id: '_2_1' }]); }
    if (url === `${v2}/groups/sets`) return page([{ id: '_3_1' }]);
    assert.equal(url, `${v2}/groups/_2_1`); return { id: '_2_1' };
  });
  assert.equal((await listGroups(client, courseId, { name: 'Equipo', inGroupSet: false })).results[0].id, '_2_1');
  assert.equal((await listGroupSets(client, courseId)).results[0].id, '_3_1');
  assert.equal((await getGroup(client, courseId, '_2_1')).id, '_2_1');
});

test('fuentes restringidas de participación conservan el error y no se convierten en listas vacías', async () => {
  const client = fixture(() => { throw denied(); });
  await assert.rejects(listDiscussions(client, courseId));
  await assert.rejects(listGroups(client, courseId));
  await assert.rejects(listGroupSets(client, courseId));
});

test('asistencia filtra respuestas globales por sesión del curso y preserva registros ausentes', async () => {
  const client = fixture((url) => {
    if (url.endsWith('/meetings')) return page([{ id: '_2_1', courseId }, { id: '_3_1', courseId }]);
    assert.equal(url, `${root}/meetings/users/${userId}`);
    return page([{ meetingId: '_2_1', userId, status: 'Present' }, { meetingId: '_99_1', userId, status: 'Absent' }]);
  });
  const result = await ownAttendance(client, courseId, { id: userId });
  assert.equal(result.results.length, 2); assert.equal(result.results[0].attendance?.status, 'Present');
  assert.equal(result.results[1].attendance, null); assert.equal(result.missingRecords, 1); assert.equal(result.complete, true);
  assert(!JSON.stringify(result).includes('_99_1')); assert(!JSON.stringify(result).includes('Absent'));
});

test('un curso sin sesiones no hereda las faltas de otros cursos', async () => {
  const client = fixture(url => url.endsWith('/meetings') ? page([]) : page([{ meetingId: '_99_1', userId, status: 'Absent' }]));
  const result = await ownAttendance(client, courseId, { id: userId });
  assert.deepEqual(result.results, []); assert.equal(result.missingRecords, 0); assert.equal(result.complete, true);
});

test('asistencia privada verifica cuenta, curso e identificadores antes de exponer registros', async () => {
  for (const record of [{ meetingId: '_2_1', userId: '_999_1' }, { userId }]) {
    const client = fixture(url => url.endsWith('/meetings') ? page([{ id: '_2_1', courseId }]) : page([record]));
    await assert.rejects(ownAttendance(client, courseId, { id: userId }), /otra cuenta|sin identificador/);
  }
  await assert.rejects(ownAttendance(fixture(() => page([{ id: '_2_1', courseId: '_999_1' }])), courseId, { id: userId }), /otro curso/);
  const duplicate = fixture(url => url.endsWith('/meetings') ? page([{ id: '_2_1', courseId }]) : page([{ meetingId: '_2_1', userId }, { meetingId: '_2_1', userId }]));
  await assert.rejects(ownAttendance(duplicate, courseId, { id: userId }), /duplicada/);
});

test('asistencia permite el identificador externo de la misma cuenta cuando el proveedor lo devuelve', async () => {
  const client = fixture(url => url.endsWith('/meetings') ? page([{ id: '_2_1', courseId }]) : page([{ meetingId: '_2_1', userId: 'external-synthetic', status: 'Late' }]));
  assert.equal((await ownAttendance(client, courseId, { id: userId, externalId: 'external-synthetic' })).results[0].attendance?.status, 'Late');
});

test('asistencia restringida devuelve sesiones y null con avisos sin secretos', async () => {
  const client = fixture(url => { if (url.endsWith('/meetings')) return page([{ id: '_2_1', courseId }]); throw denied(); });
  const result = await ownAttendance(client, courseId, { id: userId });
  assert.equal(result.complete, false); assert.equal(result.results[0].attendance, null); assert.equal(result.warnings[0].status, 403);
  assert(!JSON.stringify(result).includes('synthetic-private-value'));
});

test('matrícula consultada es propia y no acredita pagos ni inscripción académica', async () => {
  const result = await ownEnrollment(fixture(url => { assert.equal(url, `${root}/users/${userId}`); return { courseId, userId, courseRoleId: 'Student' }; }), courseId, userId);
  assert.equal(result.scope, 'blackboard_course'); assert.equal(result.enrollment.courseRoleId, 'Student');
  await assert.rejects(ownEnrollment(fixture(() => ({ userId: '_999_1' })), courseId, userId), /otra cuenta/);
  await assert.rejects(ownEnrollment(fixture(() => ({ courseId: '_999_1' })), courseId, userId), /otro curso/);
});

test('detalle de nota usa v2, conserva cero y no interpreta grade.status como estado fiable', async () => {
  const client = fixture(url => {
    if (url.endsWith(`/users/${userId}`)) return { userId, columnId: '_2_1', score: 0, status: 'Graded', exempt: false };
    if (url.endsWith('/attempts')) return page([{ id: '_3_1', userId, status: 'NeedsGrading' }]);
    assert.equal(url, `${v2}/gradebook/columns/_2_1`); return { id: '_2_1', grading: { type: 'Attempts' } };
  });
  const result = await gradeDetail(client, courseId, '_2_1', userId);
  assert.equal(result.grade.score, 0); assert.equal(result.grade.exempt, false); assert.equal(result.gradeStatusReliable, false);
  assert.equal(result.attempts?.[0].status, 'NeedsGrading'); assert.equal(result.complete, true);
});

test('nota inaccesible no produce detalle vacío y notas o intentos ajenos se rechazan', async () => {
  await assert.rejects(gradeDetail(fixture(() => { throw denied(); }), courseId, '_2_1', userId));
  await assert.rejects(gradeDetail(fixture(() => ({ userId: '_999_1' })), courseId, '_2_1', userId), /otra cuenta/);
  await assert.rejects(gradeDetail(fixture(() => ({ columnId: '_999_1' })), courseId, '_2_1', userId), /otra columna/);
  const client = fixture(url => url.endsWith('/attempts') ? page([{ id: '_3_1', userId: '_999_1' }]) : url.endsWith(`/users/${userId}`) ? { userId, columnId: '_2_1' } : { id: '_2_1', grading: { type: 'Attempts' } });
  await assert.rejects(gradeDetail(client, courseId, '_2_1', userId), /otra cuenta/);
});

test('detalle de nota distingue columna restringida e intentos no solicitados', async () => {
  const client = fixture(url => { if (url.endsWith(`/users/${userId}`)) return { userId, columnId: '_2_1' }; throw denied(); });
  const result = await gradeDetail(client, courseId, '_2_1', userId, false);
  assert.equal(result.column, null); assert.equal(result.attempts, null); assert.equal(result.attemptsRequested, false);
  assert.equal(result.complete, false); assert(!JSON.stringify(result).includes('synthetic-private-value'));
});

test('revisión de contenido preserva false y consulta solo el usuario autenticado', async () => {
  const client = fixture(url => {
    if (url.endsWith('/reviewStatus')) { assert.equal(url, `${root}/contents/_2_1/users/${userId}/reviewStatus`); return { contentId: '_2_1', userId, reviewed: false }; }
    return { id: '_2_1', reviewable: true };
  });
  const result = await contentReviewStatus(client, courseId, '_2_1', userId);
  assert.equal(result.reviewed, false); assert.equal(result.supported, true);
});

test('contenido no revisable no consulta reviewStatus ni aparece como pendiente', async () => {
  let calls = 0;
  const result = await contentReviewStatus(fixture(url => { calls++; assert(!url.endsWith('/reviewStatus')); return { id: '_2_1', reviewable: false }; }), courseId, '_2_1', userId);
  assert.equal(result.supported, false); assert.equal(result.reviewed, null); assert.equal(calls, 1);
});

test('revisión ajena o restringida no se convierte en un estado sin revisar', async () => {
  for (const review of [{ userId: '_999_1' }, { contentId: '_999_1' }]) {
    await assert.rejects(contentReviewStatus(fixture(url => url.endsWith('/reviewStatus') ? review : { id: '_2_1' }), courseId, '_2_1', userId), /otra cuenta|otro contenido/);
  }
  await assert.rejects(contentReviewStatus(fixture(url => { if (url.endsWith('/reviewStatus')) throw denied(); return { id: '_2_1' }; }), courseId, '_2_1', userId));
});

test('agenda múltiple conserva secciones por ID, deduplica selección y declara cursos inaccesibles', async () => {
  const client = fixture((url, params) => {
    if (url === '/learn/api/public/v1/courses/_404_1') throw denied();
    if (/\/courses\/_\d+_1$/.test(url)) return { id: url.split('/').at(-1), name: 'Mismo nombre' };
    if (url.includes('/calendars/')) return page([{ id: '_8_1', title: 'Evento', start: params.courseId === courseId ? '2026-10-07T14:00:00Z' : '2026-10-06T14:00:00Z' }]);
    return page([]);
  });
  const result = await multiCourseAgenda(client, [courseId, '_202_1', courseId, '_404_1'], '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z');
  assert.deepEqual(result.courseIds, [courseId, '_202_1', '_404_1']); assert.equal(result.courses.length, 3);
  assert.equal(result.events.length, 2); assert.equal(result.events[0].courseId, '_202_1');
  assert.equal(result.courses[2].agenda, null); assert.equal(result.complete, false); assert.equal(result.warnings[0].status, 403);
  assert(!JSON.stringify(result).includes('synthetic-private-value'));
});

test('agenda múltiple rechaza rango y selección inválidos antes de consultar', async () => {
  let calls = 0; const client = fixture(() => { calls++; return {}; });
  await assert.rejects(multiCourseAgenda(client, [courseId], '2026-01-01', '2026-12-01'), /112 días/);
  for (const ids of [[], ['../invalid'], Array.from({ length: 11 }, (_, index) => `_${index}_1`)]) await assert.rejects(multiCourseAgenda(client, ids, '2026-10-05', '2026-10-12'), /1 y 10/);
  assert.equal(calls, 0);
});

test('herramientas de discusión onlyMine fijan el usuario de sesión y usan Published por defecto', async () => {
  const handlers = new Map<string, Function>();
  const server = { registerTool: (name: string, _config: unknown, handler: Function) => { handlers.set(name, handler); } } as unknown as McpServer;
  const client = fixture((url, params) => {
    assert(url.endsWith('/messages') || url.endsWith('/replies')); assert.equal(params.userId, userId); assert.equal(params.status, 'Published'); return page([]);
  });
  registerTools(server, async () => ({ client, session: { cookies: [], xsrfToken: '', expiresAt: Date.now() + 10000, userId } }));
  assert.equal(handlers.size, 70);
  await handlers.get('blackboard_list_discussion_messages')!({ courseId, discussionId: '_2_1', onlyMine: true, userId: '_999_1' });
  await handlers.get('blackboard_list_discussion_replies')!({ courseId, discussionId: '_2_1', messageId: '_3_1', onlyMine: true });
});
