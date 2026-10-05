import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { assignmentDetails, assignmentFeedback, contentAttachments, courseAgenda, courseOverview, findSyllabus, listCourseFiles, listCourseLinks, searchAnnouncements, searchContents, validateCalendarRange } from '../src/blackboard/services/course-workflows.js';
import { getCalendarItems } from '../src/blackboard/api/courses.js';
import { getAttemptFiles } from '../src/blackboard/api/assignments.js';
import { allContents, attachmentList } from '../src/downloads/course-materials.js';

const courseId = '_101_1';
const root = `/learn/api/public/v1/courses/${courseId}`;
const columns = `/learn/api/public/v2/courses/${courseId}/gradebook/columns`;
function fixture(load: (url: string, options?: any) => any): AxiosInstance {
  return { get: async (url: string, options: any) => ({ data: await load(url, options) }) } as unknown as AxiosInstance;
}
function denied() { return Object.assign(new Error('synthetic-private-token'), { response: { status: 403 }, config: { headers: { Cookie: 'synthetic-private-token' } } }); }
const page = (results: any[]) => ({ results });

test('archivos de intento usan la ruta pública v1 después de comprobar la columna', async () => {
  const calls: string[] = [];
  const attemptPath = `${columns}/_5_1/attempts/_6_1`;
  const filePath = `${root}/gradebook/attempts/_6_1/files`;
  const client = fixture(url => {
    calls.push(url);
    if (url === attemptPath) return { id: '_6_1', userId: '_9_1' };
    assert.equal(url, filePath);
    return page([{ id: '_7_1', name: 'Entrega ficticia.pdf' }]);
  });
  assert.equal((await getAttemptFiles(client, courseId, '_5_1', '_6_1'))[0].id, '_7_1');
  assert.deepEqual(calls, [attemptPath, filePath]);
  let blockedCalls = 0;
  await assert.rejects(getAttemptFiles(fixture(url => {
    blockedCalls++; assert.equal(url, attemptPath); throw denied();
  }), courseId, '_5_1', '_6_1'));
  assert.equal(blockedCalls, 1);
});

test('carpetas y evaluaciones sin adjuntos REST conservan sus archivos incrustados', async () => {
  const client = fixture(url => {
    assert.equal(url, `${root}/contents`);
    return page([
      { id: '_2_1', title: 'Carpeta', contentHandler: { id: 'resource/x-bb-folder' } },
      { id: '_3_1', title: 'Evaluación', contentHandler: { id: 'resource/x-bb-asmt-test-link', instructions: '<a href="/bbcswebdav/guia.pdf">Guía.pdf</a>' } },
    ]);
  });
  const result = await listCourseFiles(client, courseId);
  assert.equal(result.complete, true); assert.equal(result.warnings.length, 0);
  assert.equal(result.results.length, 1); assert.equal(result.results[0].kind, 'embedded');
});

test('un error HTTP 400 en un documento compatible sigue siendo una fuente incompleta', async () => {
  const client = fixture(url => {
    if (url.endsWith('/contents')) return page([{ id: '_2_1', title: 'Documento', contentHandler: { id: 'resource/x-bb-document' } }]);
    assert.equal(url, `${root}/contents/_2_1/attachments`);
    throw Object.assign(new Error('Error de prueba'), { response: { status: 400 } });
  });
  const result = await listCourseFiles(client, courseId);
  assert.equal(result.complete, false); assert.equal(result.warnings[0].status, 400);
});

test('calendario usa courseId y fechas en todas las páginas', async () => {
  const calls: any[] = [];
  const client = fixture((url, options) => {
    assert.equal(url, '/learn/api/public/v1/calendars/items');
    calls.push(options.params);
    return calls.length === 1 ? { results: [{ id: '_1_1' }], paging: { nextPage: '/learn/api/public/v1/calendars/items?offset=1' } } : page([{ id: '_2_1' }]);
  });
  const result = await getCalendarItems(client, '2026-10-05T00:00:00-05:00', '2026-10-12T00:00:00-05:00', courseId);
  assert.equal(result.results.length, 2);
  assert.deepEqual(calls.map(call => call.offset), [0, 1]);
  calls.forEach(call => { assert.equal(call.courseId, courseId); assert.equal(call['course.id'], undefined); assert.equal(call.since, '2026-10-05T00:00:00-05:00'); });
});

test('rango de calendario acepta 112 días y rechaza rangos mayores o inválidos', () => {
  assert.doesNotThrow(() => validateCalendarRange('2026-01-01T00:00:00Z', '2026-04-23T00:00:00Z'));
  for (const [since, until] of [['2026-01-01T00:00:00Z', '2026-04-24T00:00:00Z'], ['invalid', 'invalid'], ['2026-01-01', '2026-01-01']]) {
    assert.throws(() => validateCalendarRange(since, until), /112 días/);
  }
});

test('búsqueda recorre carpetas, ignora tildes y evita ciclos sin leer archivos', async () => {
  const calls: string[] = [];
  const client = fixture(url => {
    calls.push(url);
    if (url === `${root}/contents`) return page([{ id: '_1_1', title: 'Semana 1', hasChildren: true }]);
    if (url === `${root}/contents/_1_1/children`) return page([
      { id: '_1_1', title: 'Ciclo', hasChildren: true },
      { id: '_2_1', title: 'Economía', body: '<p>Lectura obligatoria</p>' },
    ]);
    throw new Error(`Unexpected: ${url}`);
  });
  const result = await searchContents(client, courseId, 'economia obligatoria');
  assert.equal(result.complete, true);
  assert.equal(result.visited, 2);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].path, ['Semana 1', 'Economía']);
  assert.equal(result.searchedFileBodies, false);
  assert.equal(calls.length, 2);
});

test('sílabos incluyen candidatos por nombre de adjunto y vínculos incrustados', async () => {
  const client = fixture(url => {
    if (url.endsWith('/contents')) return page([{ id: '_2_1', title: 'Información', body: '<a href="/bbcswebdav/pid-2-dt-content-rid-3_1/x.pdf">Sílabo vigente.pdf</a>' }]);
    if (url.endsWith('/attachments')) return page([{ id: '_3_1', fileName: 'SYLLABUS-2026.pdf' }, { id: '_4_1', fileName: 'Lectura.pdf' }]);
    throw new Error(`Unexpected: ${url}`);
  });
  const result = await findSyllabus(client, courseId);
  assert.equal(result.complete, true);
  assert(result.results.some(item => item.kind === 'attachment' && item.attachmentId === '_3_1'));
  assert(result.results.some(item => item.kind === 'embedded' && item.fileName === 'Sílabo vigente.pdf'));
  assert(!result.results.some(item => item.fileName === 'Lectura.pdf'));
  assert(result.verification.includes('Candidatos'));
});

test('búsqueda informa límites de contenido, profundidad y resultados', async () => {
  const client = fixture(url => url.endsWith('/children')
    ? page([{ id: '_3_1', title: 'Sílabo' }])
    : page([{ id: '_1_1', title: 'Sílabo 1', hasChildren: true }, { id: '_2_1', title: 'Sílabo 2' }]));
  const itemLimit = await searchContents(client, courseId, 'silabo', { maxItems: 1 });
  assert.equal(itemLimit.visited, 1); assert.equal(itemLimit.truncated, true); assert.equal(itemLimit.complete, false);
  const depthLimit = await searchContents(client, courseId, 'silabo', { maxDepth: 0 });
  assert.equal(depthLimit.visited, 2); assert.equal(depthLimit.truncated, true);
  const resultLimit = await searchContents(client, courseId, 'silabo', { maxResults: 1 });
  assert.equal(resultLimit.results.length, 1); assert.equal(resultLimit.truncated, true);
});

test('carpetas y adjuntos restringidos se muestran como consultas incompletas', async () => {
  const client = fixture(url => {
    if (url.endsWith('/contents')) return page([{ id: '_1_1', title: 'Sílabo', hasChildren: true }]);
    throw denied();
  });
  const result = await findSyllabus(client, courseId);
  assert.equal(result.complete, false);
  assert.equal(result.results.length, 1);
  assert.equal(result.warnings.length, 2);
  assert(result.warnings.every(warning => warning.status === 403));
  assert(!JSON.stringify(result).includes('synthetic-private-token'));
});

test('detalle recupera las instrucciones del contenido y conserva una nota cero', async () => {
  const client = fixture(url => {
    if (url === columns) return page([{ id: '_5_1', name: 'Actividad', contentId: '_2_1', grading: { type: 'Attempts' } }]);
    if (url === `${root}/contents/_2_1`) return { id: '_2_1', contentHandler: { instructions: '<p>Entrega una reflexión.</p>' } };
    if (url.endsWith('/attachments')) return page([]);
    if (url.endsWith('/attempts')) return page([{ id: '_6_1', score: 0, status: 'Graded' }]);
    throw new Error(`Unexpected: ${url}`);
  });
  const result = await assignmentDetails(client, courseId, '_5_1');
  assert.equal(result.instructions, 'Entrega una reflexión.');
  assert.equal(result.attempts![0].score, 0);
  assert.equal(result.complete, true);
  await assert.rejects(assignmentDetails(client, courseId, '_999_1'), /No se encontró/);
});

test('detalle distingue intentos y archivos inaccesibles de listas vacías', async () => {
  const client = fixture(url => {
    if (url === columns) return page([{ id: '_5_1', name: 'Actividad', contentId: '_2_1', grading: { type: 'Attempts' } }]);
    throw denied();
  });
  const result = await assignmentDetails(client, courseId, '_5_1');
  assert.equal(result.instructions, null); assert.equal(result.attachments, null); assert.equal(result.attempts, null);
  assert.equal(result.complete, false); assert.equal(result.warnings.length, 3);
});

test('retroalimentación conserva último intento y advierte archivos restringidos', async () => {
  const client = fixture(url => {
    if (url === columns) return page([{ id: '_5_1', name: 'Actividad', grading: { type: 'Attempts' } }]);
    if (url.endsWith('/attempts')) return page([
      { id: '_6_1', modified: '2026-10-01T00:00:00Z', score: 15 },
      { id: '_7_1', modified: '2026-10-02T00:00:00Z', score: 0, instructorFeedback: 'Revisar' },
    ]);
    throw denied();
  });
  const result = await assignmentFeedback(client, courseId, true);
  const latest = result.results[0] as any;
  assert.equal(latest.attempt.id, '_7_1'); assert.equal(latest.attempt.score, 0);
  assert.equal(latest.attemptFiles, null); assert.equal(result.complete, false);
  assert(!JSON.stringify(result).includes('synthetic-private-token'));
});

test('adjuntos conserva archivos incrustados y advierte fallos REST', async () => {
  const client = fixture(url => {
    if (url.endsWith('/attachments')) throw denied();
    return { contentHandler: { instructions: '<a href="/bbcswebdav/x.pdf">Guía.pdf</a>' } };
  });
  const result = await contentAttachments(client, courseId, '_2_1');
  assert.equal(result.embedded[0].fileName, 'Guía.pdf'); assert.equal(result.complete, false);
  assert.equal(result.warnings[0].status, 403);
});

test('resumen conserva el ID y distingue notas restringidas de notas ausentes', async () => {
  const client = fixture(url => {
    if (url === root) return { id: courseId, name: 'Economía' };
    if (url.includes('/gradebook/users/')) throw denied();
    return page([]);
  });
  const result = await courseOverview(client, courseId, '_9_1') as any;
  assert.equal(result.course.id, courseId); assert.equal(result.contentsScope, 'root');
  assert.equal(result.grades, null); assert.equal(result.complete, false); assert.equal(result.warnings[0].section, 'grades');
});

test('agenda conserva las fuentes, ordena fechas y no inventa estado de entrega', async () => {
  const client = fixture((url, options) => {
    if (url === root) return { id: courseId, name: 'Curso' };
    if (url === columns) return page([
      { id: '_5_1', name: 'Entrega', grading: { type: 'Attempts', due: '2026-10-07T14:00:00Z' } },
      { id: '_6_1', name: 'Sin fecha', grading: { type: 'Manual' } },
      { id: '_7_1', name: 'Fuera', grading: { type: 'Attempts', due: '2026-11-07T14:00:00Z' } },
    ]);
    if (url.includes('/calendars/')) { assert.equal(options.params.courseId, courseId); return page([
      { id: '_8_1', title: 'Examen', start: '2026-10-06T14:00:00Z', end: '2026-10-06T15:00:00Z' },
      { id: '_9_1', title: 'Mismo vencimiento', start: '2026-10-07T14:00:00Z' },
    ]); }
    throw new Error(`Unexpected: ${url}`);
  });
  const result = await courseAgenda(client, courseId, '2026-10-05T00:00:00-05:00', '2026-10-12T00:00:00-05:00');
  assert.equal(result.events.length, 3); assert.equal(result.events[0].id, '_8_1');
  assert.equal((result.events.find(item => item.source === 'assignment') as any).completionStatus, 'unknown');
  assert.equal(result.undatedAssignments.length, 1); assert.equal(result.complete, true);
});

test('agenda rechaza rangos antes de consultar y valida acceso al curso', async () => {
  let calls = 0;
  const client = fixture(() => { calls++; throw denied(); });
  await assert.rejects(courseAgenda(client, courseId, '2026-01-01', '2026-12-01'), /112 días/);
  assert.equal(calls, 0);
  await assert.rejects(courseAgenda(client, courseId, '2026-10-05', '2026-10-12'));
  assert.equal(calls, 1);
});

test('agenda conserva vencimientos aunque el calendario esté restringido', async () => {
  const client = fixture(url => {
    if (url === root) return { id: courseId };
    if (url === columns) return page([{ id: '_5_1', name: 'Entrega', grading: { type: 'Attempts', due: '2026-10-07T14:00:00Z' } }]);
    throw denied();
  });
  const result = await courseAgenda(client, courseId, '2026-10-05', '2026-10-12');
  assert.equal(result.complete, false); assert.equal(result.events.length, 1); assert.equal(result.warnings[0].section, 'calendar');
});

test('contenido y adjuntos rechazan colecciones inválidas en vez de ocultar el error', async () => {
  const client = fixture(() => ({}));
  await assert.rejects(allContents(client, courseId), /colección inválida/);
  await assert.rejects(attachmentList(client, courseId, '_2_1'), /colección inválida/);
});

test('inventario de archivos filtra extensiones sin consumir el límite con páginas', async () => {
  const client = fixture(url => {
    if (url.endsWith('/contents')) return page([{ id: '_1_1', title: 'Página', hasChildren: true }]);
    if (url.endsWith('/children')) return page([{ id: '_2_1', title: 'Material', body: '<a href="/bbcswebdav/x.pdf">Lectura.PDF</a>' }]);
    if (url.endsWith('/_1_1/attachments')) return page([]);
    if (url.endsWith('/attachments')) return page([{ id: '_3_1', fileName: 'Diapositivas.PPTX', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }]);
    throw new Error(`Unexpected: ${url}`);
  });
  const result = await listCourseFiles(client, courseId, { extensions: ['PDF'], maxResults: 1 });
  assert.equal(result.results.length, 1); assert.equal(result.results[0].kind, 'embedded');
  assert.equal(result.results[0].extension, 'pdf'); assert.equal(result.complete, true);
  const all = await listCourseFiles(client, courseId);
  assert.equal(all.results.length, 2); assert.equal(all.downloadedFiles, false);
  assert(all.results.find(item => item.attachmentId === '_3_1')?.mimeType);
});

test('inventario de enlaces incluye URL de contenido y texto, evita duplicados y no abre destinos', async () => {
  let calls = 0;
  const client = fixture(url => {
    calls++; assert.equal(url, `${root}/contents`);
    return page([{ id: '_1_1', title: 'Referencias', contentHandler: { url: 'https://example.edu/lectura?a=1&b=2' },
      body: '<a href="https://example.edu/lectura?a=1&amp;b=2">Lectura</a><a href="/webapps/portal/">Portal</a><a href="javascript:alert(1)">JS</a><a href="https://user:password@example.test/">Credencial</a><a href="/bbcswebdav/x.pdf">Archivo.pdf</a>' }]);
  });
  const result = await listCourseLinks(client, courseId);
  assert.equal(result.results.length, 2); assert.equal(calls, 1);
  assert.equal(result.results[0].external, true); assert.equal(result.results[1].external, false);
  assert.equal(result.openedExternalLinks, false); assert.equal(result.complete, true);
  assert(!JSON.stringify(result.results).includes('password'));
});

test('anuncios se buscan por todos los términos, sin tildes y con límite explícito', async () => {
  const client = fixture(url => {
    assert.equal(url, `${root}/announcements`);
    return page([{ id: '_1_1', title: 'Evaluación', body: '<p>Nueva fecha</p>' },
      { id: '_2_1', title: 'Otra evaluación', body: '<p>Cambio de fecha</p>' }, { id: '_3_1', title: 'Fecha', body: 'Lectura' }]);
  });
  const result = await searchAnnouncements(client, courseId, 'evaluacion FECHA', 1);
  assert.equal(result.results.length, 1); assert.equal(result.matched, 2); assert.equal(result.searched, 3);
  assert.equal(result.truncated, true); assert.equal(result.complete, false);
});

test('un fallo al consultar anuncios no se convierte en cero coincidencias', async () => {
  const client = fixture(() => { throw denied(); });
  await assert.rejects(searchAnnouncements(client, courseId, 'examen'));
});
