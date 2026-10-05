import type { AxiosInstance } from 'axios';
import { getCourse, getCourseContents, getGradeColumns, getGradebookCategories, getGrades } from '../api/courses.js';
import { listAttempts } from '../api/assignments.js';
import { htmlToText } from '../../downloads/course-materials.js';
import { contentReviewStatus } from './participation.js';
import { courseAgenda, courseOverview, findSyllabus, queryWarning, searchAnnouncements, searchContents, type QueryWarning } from './course-workflows.js';

const validId = (value: unknown): value is string => typeof value === 'string' && /^_\d+_\d+$/.test(value);
export function selectedCourses(courseIds: string[], maximum = 10): string[] {
  const ids = [...new Set(courseIds)];
  if (!ids.length || ids.length > maximum || ids.some(id => !validId(id))) throw new Error(`Selecciona entre 1 y ${maximum} IDs de curso válidos.`);
  return ids;
}
export type OutlineOptions = { maxItems?: number; maxDepth?: number };
export async function courseOutline(client: AxiosInstance, courseId: string, options: OutlineOptions = {}) {
  const maxItems = options.maxItems ?? 300, maxDepth = options.maxDepth ?? 20;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 1000 || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 30) throw new Error('Límites de recorrido inválidos.');
  const course = await getCourse(client, courseId);
  const results: Array<{ contentId: string; parentId: string | null; title: string; path: string[]; depth: number; kind: string | null; hasChildren: boolean; reviewable: boolean | null }> = [];
  const warnings: QueryWarning[] = [], seen = new Set<string>(); let truncated = false;
  async function visit(parentId: string | undefined, parents: string[], depth: number) {
    if (depth > maxDepth) { truncated = true; return; }
    let items: any[];
    try { items = (await getCourseContents(client, courseId, parentId)).results; }
    catch (error) { warnings.push(queryWarning('contents', error, parentId ?? courseId)); return; }
    for (const item of items) {
      if (!validId(item?.id)) { warnings.push({ section: 'contents', message: 'Contenido sin ID válido.' }); continue; }
      if (seen.has(item.id)) { warnings.push({ section: 'contents', id: item.id, message: 'Referencia repetida o cíclica omitida.' }); continue; }
      if (results.length >= maxItems) { truncated = true; return; }
      seen.add(item.id); const title = typeof item.title === 'string' ? item.title : item.id;
      const itemPath = [...parents, title];
      results.push({ contentId: item.id, parentId: parentId ?? null, title, path: itemPath, depth, kind: item.contentHandler?.id ?? null,
        hasChildren: item.hasChildren === true, reviewable: typeof item.reviewable === 'boolean' ? item.reviewable : null });
      if (item.hasChildren === true) await visit(item.id, itemPath, depth + 1);
    }
  }
  await visit(undefined, [], 0);
  return { courseId, course, results, visited: results.length, limits: { maxItems, maxDepth }, truncated, complete: !truncated && !warnings.length, warnings };
}

export async function multiContentSearch(client: AxiosInstance, courseIds: string[], query: string, options: OutlineOptions & { maxResults?: number; includeAttachments?: boolean } = {}) {
  const ids = selectedCourses(courseIds), maximum = options.maxItems ?? 300, maxResults = options.maxResults ?? 50;
  let visited = 0, truncated = false; const results: any[] = [], courses: any[] = [], warnings: QueryWarning[] = [];
  for (const courseId of ids) {
    if (visited >= maximum || results.length >= maxResults) { courses.push({ courseId, searched: false }); truncated = true; continue; }
    try {
      const data = await searchContents(client, courseId, query, { ...options, maxItems: maximum - visited, maxResults: maxResults - results.length });
      visited += data.visited; results.push(...data.results); warnings.push(...data.warnings); truncated ||= data.truncated;
      courses.push({ courseId, searched: true, visited: data.visited, complete: data.complete });
    } catch (error) { courses.push({ courseId, searched: false }); warnings.push(queryWarning('contents', error, courseId)); }
  }
  return { courseIds: ids, query, results, courses, visited, truncated, complete: !truncated && !warnings.length, warnings, searchedFileBodies: false,
    limits: { maxItems: maximum, maxResults, maxDepth: options.maxDepth ?? 20 } };
}
export async function multiAnnouncementSearch(client: AxiosInstance, courseIds: string[], query: string, maxResults = 50) {
  const ids = selectedCourses(courseIds), courses: any[] = [], results: any[] = [], warnings: QueryWarning[] = []; let truncated = false;
  for (const courseId of ids) {
    if (results.length >= maxResults) { courses.push({ courseId, searched: false }); truncated = true; continue; }
    try {
      const data = await searchAnnouncements(client, courseId, query, maxResults - results.length);
      results.push(...data.results.map(item => ({ courseId, announcement: item }))); truncated ||= data.truncated;
      courses.push({ courseId, searched: true, searchedCount: data.searched, matched: data.matched });
    } catch (error) { courses.push({ courseId, searched: false }); warnings.push(queryWarning('announcements', error, courseId)); }
  }
  return { courseIds: ids, query, results, courses, truncated, complete: !truncated && !warnings.length, warnings };
}
export async function submissionReceipts(client: AxiosInstance, courseId: string, columnId: string, userId: string) {
  const attempts = await listAttempts(client, courseId, columnId);
  if (attempts.some(attempt => attempt.userId !== undefined && attempt.userId !== userId)) throw new Error('Blackboard devolvió intentos de otra cuenta.');
  return { courseId, columnId, userId, results: attempts.map(attempt => ({ attemptId: attempt.id, status: attempt.status,
    attemptDate: attempt.attemptDate ?? null, receipt: (attempt as any).attemptReceipt ?? null })),
    note: 'Comprobantes publicados para los intentos propios. La ausencia de un comprobante no demuestra que no hayas entregado.' };
}
export async function reviewSummary(client: AxiosInstance, courseId: string, userId: string, options: OutlineOptions = {}) {
  const outline = await courseOutline(client, courseId, options), warnings = [...outline.warnings]; const results: any[] = [];
  for (const content of outline.results) {
    if (content.reviewable !== true) { results.push({ ...content, reviewed: null, queried: false }); continue; }
    try { const review = await contentReviewStatus(client, courseId, content.contentId, userId); results.push({ ...content, reviewed: review.reviewed, queried: true }); }
    catch (error) { results.push({ ...content, reviewed: null, queried: true }); warnings.push(queryWarning('reviewStatus', error, content.contentId)); }
  }
  return { courseId, results, counts: { reviewed: results.filter(item => item.reviewed === true).length,
    unreviewed: results.filter(item => item.reviewed === false).length, unknownOrUnsupported: results.filter(item => item.reviewed === null).length },
    complete: outline.complete && !warnings.length, truncated: outline.truncated, warnings,
    note: 'Solo estados de revisión configurados por Blackboard; no mide aprendizaje ni progreso académico.' };
}
export async function courseGradebook(client: AxiosInstance, courseId: string, userId: string) {
  const course = await getCourse(client, courseId), grades = (await getGrades(client, courseId, userId)).results;
  if (grades.some((grade: any) => grade.userId !== undefined && grade.userId !== userId)) throw new Error('Blackboard devolvió notas de otra cuenta.');
  const warnings: QueryWarning[] = []; let columns: any[] | null = null, categories: any[] | null = null;
  try { columns = (await getGradeColumns(client, courseId)).results; } catch (error) { warnings.push(queryWarning('columns', error, courseId)); }
  try { categories = (await getGradebookCategories(client, courseId)).results; } catch (error) { warnings.push(queryWarning('categories', error, courseId)); }
  const byGrade = new Map<string, any>(), byColumn = new Map<string, any>();
  for (const grade of grades) { if (!validId(grade.columnId) || byGrade.has(grade.columnId)) throw new Error('Nota sin columna válida o duplicada.'); byGrade.set(grade.columnId, grade); }
  for (const column of columns ?? []) { if (!validId(column.id) || byColumn.has(column.id)) throw new Error('Columna inválida o duplicada.'); byColumn.set(column.id, column); }
  const results = [...new Set([...byColumn.keys(), ...byGrade.keys()])].map(columnId => {
    const column = byColumn.get(columnId) ?? null;
    return { columnId, column, grade: byGrade.get(columnId) ?? null, category: categories?.find(item => item.id === column?.gradebookCategoryId) ?? null };
  });
  return { courseId, course, userId, results, complete: !warnings.length, warnings, calculatedFinalGrade: false, gradeStatusReliable: false,
    note: 'Mantiene puntajes y displayGrade originales. Sin nota se representa con null; no inventa escalas, ponderaciones ni promedio final.' };
}
export async function multiGradebook(client: AxiosInstance, courseIds: string[], userId: string) {
  const ids = selectedCourses(courseIds), courses: any[] = [], warnings: QueryWarning[] = [];
  for (const courseId of ids) {
    try { const gradebook = await courseGradebook(client, courseId, userId); courses.push({ courseId, gradebook }); warnings.push(...gradebook.warnings); }
    catch (error) { courses.push({ courseId, gradebook: null }); warnings.push(queryWarning('gradebook', error, courseId)); }
  }
  return { courseIds: ids, courses, complete: !warnings.length, warnings, calculatedFinalGrade: false };
}
export async function multiOverview(client: AxiosInstance, courseIds: string[], userId: string) {
  const ids = selectedCourses(courseIds, 5), courses: any[] = [], warnings: QueryWarning[] = [];
  for (const courseId of ids) {
    try { const overview = await courseOverview(client, courseId, userId); courses.push({ courseId, overview }); warnings.push(...overview.warnings); }
    catch (error) { courses.push({ courseId, overview: null }); warnings.push(queryWarning('overview', error, courseId)); }
  }
  return { courseIds: ids, courses, complete: !warnings.length, warnings };
}
export async function studyBrief(client: AxiosInstance, courseId: string, since: string, until: string) {
  const agenda = await courseAgenda(client, courseId, since, until), warnings = [...agenda.warnings]; let syllabus: Awaited<ReturnType<typeof findSyllabus>> | null = null;
  try { syllabus = await findSyllabus(client, courseId, { maxItems: 150, maxDepth: 15, maxResults: 10 }); warnings.push(...syllabus.warnings); }
  catch (error) { warnings.push(queryWarning('syllabus', error, courseId)); }
  const clean = (value: unknown) => htmlToText(String(value ?? '')).replace(/[\r\n]+/g, ' ');
  const markdown = [`# ${clean(agenda.course.name ?? courseId)}`, '', `Curso: ${courseId}`, `Intervalo: ${since} — ${until}`, 'Zona horaria: America/Lima', '',
    '## Fechas publicadas', ...agenda.events.map(event => `- ${new Date(event.start!).toLocaleString('es-PE', { timeZone: 'America/Lima' })}: ${clean(event.title)} (fuente ${event.source}, ID ${event.id}).`), '',
    '## Posibles sílabos', ...(syllabus?.results.map(item => `- ${clean(item.path.join(' / '))} (contenido ${item.contentId}).`) ?? ['Consulta no disponible.']), '',
    'Verifica los documentos antes de usar su información. Las fechas no determinan qué falta entregar. No se calcula tiempo de estudio ni se presupone disponibilidad.', '',
    ...(warnings.length || !syllabus?.complete ? ['Consulta parcial: revisa complete, truncated y warnings en el resultado MCP.'] : [])].join('\n');
  return { courseId, agenda, syllabus, markdown, complete: agenda.complete && syllabus?.complete === true && !warnings.length, warnings, generatedFromPublishedData: true };
}
