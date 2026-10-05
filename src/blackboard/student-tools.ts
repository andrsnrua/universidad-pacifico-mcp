import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import type { Session } from './types.js';
import { getMe } from './api/courses.js';
import { announcement, calendarEvent, calendarTypes, gradePeriods, institutionAnnouncements, visibleCalendars } from './api/student.js';
import { courseGradebook, courseOutline, multiAnnouncementSearch, multiContentSearch, multiGradebook, multiOverview, reviewSummary, studyBrief, submissionReceipts } from './services/student.js';
import { exportAttendance, exportBrief, exportMultiAgenda, exportMultiGrades, exportOutline, exportReceipts } from './services/student-exports.js';
import { validateCalendarRange } from './services/course-workflows.js';
import { inspectManifest, listMaterials, readMaterial, searchMaterials } from '../library/materials.js';

type GetClient = () => Promise<{ client: AxiosInstance; session: Session }>;
const id = z.string().regex(/^_\d+_\d+$/, 'Usa un ID Blackboard como _12345_1.');
const courseIds = z.array(id).min(1).max(10);
const course = { courseId: id };
const outlineLimits = { maxItems: z.number().int().min(1).max(1000).optional(), maxDepth: z.number().int().min(0).max(30).optional() };
const maxResults = z.number().int().min(1).max(100).optional();
const query = z.string().trim().min(1).max(300);
const relative = z.string().max(1000).refine(value => !/^(?:[\\/]|[a-z]:)/i.test(value) && !value.includes(':') && !value.split(/[\\/]/).some(part => part === '..' || part.startsWith('.')), 'Usa una ruta relativa segura dentro de las descargas.');
const range = { since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) };
const output = { outputDir: relative.optional(), allowPartial: z.boolean().optional() };
const pages = { startPage: z.number().int().min(1).max(10000).optional(), maxPages: z.number().int().min(1).max(20).optional() };
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE_LOCAL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export function registerStudentTools(server: McpServer, getClient: GetClient) {
  const register = (name: string, description: string, inputSchema: Record<string, z.ZodType>, handler: (args: any) => Promise<unknown> | unknown, localWrite = false) =>
    server.registerTool(`blackboard_${name}`, { description, inputSchema, annotations: localWrite ? WRITE_LOCAL : READ }, async args =>
      ({ content: [{ type: 'text' as const, text: JSON.stringify(await handler(args), null, 2) }] }));
  const ownId = async (client: AxiosInstance, session: Session) => {
    const value = session.userId ?? (await getMe(client)).id; if (!id.safeParse(value).success) throw new Error('No se identificó la cuenta autenticada.'); return value as string;
  };
  register('list_institution_announcements', 'Anuncios institucionales que Aula Virtual UP permite ver; título y vencidos opcionales. Un resultado vacío no equivale a error de permisos.',
    { title: z.string().trim().min(1).max(200).optional(), includeExpired: z.boolean().optional() }, async options => institutionAnnouncements((await getClient()).client, options));
  register('list_calendars', 'Calendarios visibles para la cuenta actual. Consulta eventos con list_calendar; no equivale al horario académico completo.', {}, async () => visibleCalendars((await getClient()).client));
  register('get_calendar_event', 'Detalle de un evento accesible por tipo e ID devueltos por list_calendar; no modifica citas.',
    { type: z.enum(calendarTypes), eventId: z.string().regex(/^[_A-Za-z0-9-]{1,160}$/) }, async args => calendarEvent((await getClient()).client, args.type, args.eventId));
  register('get_announcement', 'Texto y fechas de un anuncio accesible de la sección indicada.', { ...course, announcementId: id }, async args => announcement((await getClient()).client, args.courseId, args.announcementId));
  register('list_grade_periods', 'Periodos de evaluación configurados en el libro de notas del curso. Pueden estar vacíos; no determina el periodo oficial de matrícula.', course, async args => gradePeriods((await getClient()).client, args.courseId));
  register('get_course_outline', 'Estructura recursiva acotada de carpetas y contenidos, con rutas, tipos y avisos de truncamiento.', { ...course, ...outlineLimits }, async ({ courseId, ...options }) => courseOutline((await getClient()).client, courseId, options));
  register('search_multi_course_contents', 'Busca títulos, texto publicado y nombres de archivos en 1 a 10 secciones elegidas. Presupuesto global de recorrido; no lee el cuerpo de archivos remotos.',
    { courseIds, query, ...outlineLimits, maxResults, includeAttachments: z.boolean().optional() }, async ({ courseIds, query, ...options }) => multiContentSearch((await getClient()).client, courseIds, query, options));
  register('search_multi_course_announcements', 'Busca términos en anuncios de 1 a 10 secciones, conserva courseId y señala cursos no consultados o restringidos.',
    { courseIds, query, maxResults }, async args => multiAnnouncementSearch((await getClient()).client, args.courseIds, args.query, args.maxResults));
  register('get_submission_receipts', 'Comprobantes publicados de tus intentos en una actividad. Un comprobante ausente no demuestra falta de entrega; no crea comprobantes.',
    { ...course, columnId: id }, async args => { const { client, session } = await getClient(); return submissionReceipts(client, args.courseId, args.columnId, await ownId(client, session)); });
  register('get_course_review_summary', 'Estados propios de los contenidos configurados como revisables en un recorrido acotado. No marca revisiones ni calcula progreso académico.',
    { ...course, ...outlineLimits }, async ({ courseId, ...options }) => { const { client, session } = await getClient(); return reviewSummary(client, courseId, await ownId(client, session), options); });
  register('get_course_gradebook', 'Une tus notas, columnas y categorías de la sección. Preserva null y puntajes cero; no calcula ponderaciones ni promedios.', course,
    async args => { const { client, session } = await getClient(); return courseGradebook(client, args.courseId, await ownId(client, session)); });
  register('get_multi_course_gradebook', 'Consulta libros de notas propios de 1 a 10 cursos elegidos por ID, con avisos por fuente. No mezcla secciones ni calcula promedio general.', { courseIds },
    async args => { const { client, session } = await getClient(); return multiGradebook(client, args.courseIds, await ownId(client, session)); });
  register('get_multi_course_overview', 'Panorama de 1 a 5 cursos elegidos: anuncios, raíz de contenidos, actividades y notas propias. Conserva resultados parciales por sección.', { courseIds: z.array(id).min(1).max(5) },
    async args => { const { client, session } = await getClient(); return multiOverview(client, args.courseIds, await ownId(client, session)); });
  register('get_study_brief', 'Resumen basado en fechas publicadas y candidatos a sílabo, con fuentes y avisos. No supone tareas pendientes ni inventa disponibilidad de estudio.', { ...course, ...range },
    async args => { validateCalendarRange(args.since, args.until); return studyBrief((await getClient()).client, args.courseId, args.since, args.until); });

  register('list_downloaded_materials', 'Inventario local de descargas UP con rutas relativas, tamaños y formatos legibles. No requiere sesión ni descarga archivos nuevos.',
    { subdirectory: relative.optional(), maxFiles: z.number().int().min(1).max(1000).optional(), maxDepth: z.number().int().min(0).max(30).optional() }, listMaterials);
  register('read_downloaded_material', 'Lee texto local de PDF, DOCX, PPTX, XLSX y texto UTF-8 dentro de las descargas. Hasta 20 MiB, 20 páginas PDF y 20000 caracteres por respuesta; no ejecuta documentos ni hace OCR.',
    { path: relative.min(1), offset: z.number().int().min(0).max(200000).optional(), maxChars: z.number().int().min(1).max(20000).optional(), ...pages }, ({ path, ...options }) => readMaterial(path, options));
  register('search_downloaded_materials', 'Busca términos en el texto de materiales ya descargados, con límites y avisos de cobertura. No consulta archivos externos ni hace OCR.',
    { query, subdirectory: relative.optional(), maxFiles: z.number().int().min(1).max(25).optional(), maxResults, maxPages: pages.maxPages }, ({ query, ...options }) => searchMaterials(query, options));
  register('inspect_course_manifest', 'Comprueba existencia y tamaño de descargas referenciadas por un manifest.json local. Rechaza rutas externas; no verifica hashes ni contenido remoto.',
    { path: relative.min(1) }, args => inspectManifest(args.path));

  register('export_multi_course_agenda', 'Guarda una copia ICS de fechas de 1 a 10 cursos en descargas/exports, con identificadores por sección. No sincroniza calendarios; parcial solo con allowPartial.',
    { courseIds, ...range, ...output }, async ({ courseIds, since, until, ...options }) => { validateCalendarRange(since, until); return exportMultiAgenda((await getClient()).client, courseIds, since, until, options); }, true);
  register('export_attendance', 'Guarda CSV privado de tu asistencia filtrada por sesiones del curso; registros ausentes quedan vacíos. No exporta otras cuentas.',
    { ...course, ...output }, async ({ courseId, ...options }) => { const { client } = await getClient(), user = await getMe(client); const userId = await ownId(client, { userId: user.id } as Session);
      return exportAttendance(client, courseId, { id: userId, ...(typeof user.externalId === 'string' ? { externalId: user.externalId } : {}) }, options); }, true);
  register('export_course_outline', 'Guarda JSON privado con estructura y fuentes de un curso; evita exportar consultas incompletas sin allowPartial.',
    { ...course, ...outlineLimits, ...output }, async ({ courseId, ...options }) => exportOutline((await getClient()).client, courseId, options), true);
  register('export_study_brief', 'Guarda un resumen Markdown privado de fechas y posibles sílabos. No descarga el documento ni garantiza que sea el sílabo vigente.',
    { ...course, ...range, ...output }, async ({ courseId, since, until, ...options }) => { validateCalendarRange(since, until); return exportBrief((await getClient()).client, courseId, since, until, options); }, true);
  register('export_submission_receipts', 'Guarda CSV privado con los comprobantes existentes de tus intentos de una actividad, incluyendo ausencia de comprobante.',
    { ...course, columnId: id, ...output }, async ({ courseId, columnId, ...options }) => { const { client, session } = await getClient(); return exportReceipts(client, courseId, columnId, await ownId(client, session), options); }, true);
  register('export_multi_course_grades', 'Guarda CSV privado de tus notas de los cursos elegidos. Conserva notas ausentes y ceros; no calcula promedios o escalas.',
    { courseIds, ...output }, async ({ courseIds, ...options }) => { const { client, session } = await getClient(); return exportMultiGrades(client, courseIds, await ownId(client, session), options); }, true);
}
