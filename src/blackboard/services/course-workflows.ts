import type { AxiosInstance } from 'axios';
import { getCalendarItems, getContent, getCourse, getCourseAnnouncements, getCourseContents, getGrades } from '../api/courses.js';
import { getAttemptFiles, listAssignments, listAttempts, type GradeColumn } from '../api/assignments.js';
import { attachmentList, embeddedFiles, htmlToText } from '../../downloads/course-materials.js';
import { BLACKBOARD_BASE_URL } from '../config.js';

export interface QueryWarning { section: string; id?: string; status?: number; message: string }
export function queryWarning(section: string, error: unknown, id?: string): QueryWarning {
  const status = (error as { response?: { status?: number } })?.response?.status;
  // Do not serialize Axios request headers, cookies or server payloads in partial results.
  return { section, ...(id ? { id } : {}), ...(status ? { status } : {}),
    message: status ? `Blackboard respondió HTTP ${status}.` : 'No se pudo completar la consulta.' };
}

export function contentInstructions(content: any): string {
  return [content?.body, content?.contentHandler?.instructions]
    .filter((value): value is string => typeof value === 'string' && !!value.trim())
    .filter((value, index, values) => values.indexOf(value) === index).join('\n\n');
}

export async function contentAttachments(client: AxiosInstance, courseId: string, contentId: string) {
  const content = await getContent(client, courseId, contentId);
  const warnings: QueryWarning[] = [];
  let attachments: Awaited<ReturnType<typeof attachmentList>> = [];
  try { attachments = await attachmentList(client, courseId, contentId, content); }
  catch (error) { warnings.push(queryWarning('attachments', error, contentId)); }
  return { courseId, contentId, attachments, embedded: embeddedFiles(contentInstructions(content)),
    complete: warnings.length === 0, warnings };
}

export async function assignmentDetails(client: AxiosInstance, courseId: string, columnId: string) {
  const columns = await listAssignments(client, courseId);
  const assignment = columns.find(column => column.id === columnId);
  if (!assignment) throw new Error('No se encontró una actividad accesible con ese columnId.');
  const warnings: QueryWarning[] = [];
  let content: any = null;
  let attempts: Awaited<ReturnType<typeof listAttempts>> | null = null;
  let attachments: Awaited<ReturnType<typeof attachmentList>> | null = null;
  if (assignment.contentId) {
    try { content = await getContent(client, courseId, assignment.contentId); }
    catch (error) { warnings.push(queryWarning('content', error, assignment.contentId)); }
    try { attachments = await attachmentList(client, courseId, assignment.contentId, content ?? undefined); }
    catch (error) { warnings.push(queryWarning('attachments', error, assignment.contentId)); }
  }
  try { attempts = await listAttempts(client, courseId, columnId); }
  catch (error) { warnings.push(queryWarning('attempts', error, columnId)); }
  const instructions = contentInstructions(content) || assignment.description || '';
  return { courseId, columnId, assignment, content, instructions: htmlToText(instructions) || null,
    attachments, embedded: embeddedFiles(instructions), attempts,
    complete: warnings.length === 0, warnings };
}

export async function assignmentFeedback(client: AxiosInstance, courseId: string, includeAttemptFiles = false) {
  const assignments = await listAssignments(client, courseId);
  const results = [];
  for (const assignment of assignments) {
    const warnings: QueryWarning[] = [];
    try {
      const attempts = await listAttempts(client, courseId, assignment.id);
      const latest = attempts.sort((a, b) =>
        (b.attemptDate ?? b.modified ?? b.created ?? '').localeCompare(a.attemptDate ?? a.modified ?? a.created ?? ''))[0];
      if (!latest) {
        results.push({ assignment: assignment.name, columnId: assignment.id, status: 'sin_intentos', complete: true, warnings });
        continue;
      }
      let attemptFiles: Awaited<ReturnType<typeof getAttemptFiles>> | null = null;
      if (includeAttemptFiles) {
        try { attemptFiles = await getAttemptFiles(client, courseId, assignment.id, latest.id); }
        catch (error) { warnings.push(queryWarning('attemptFiles', error, latest.id)); }
      }
      // Attempt files are not necessarily files supplied as instructor feedback.
      results.push({ assignment: assignment.name, columnId: assignment.id, attempt: latest, attemptFiles, attemptFilesRequested: includeAttemptFiles,
        complete: warnings.length === 0, warnings });
    } catch (error) {
      warnings.push(queryWarning('attempts', error, assignment.id));
      results.push({ assignment: assignment.name, columnId: assignment.id, complete: false, warnings });
    }
  }
  return { courseId, results, complete: results.every(result => result.complete) };
}

export async function courseOverview(client: AxiosInstance, courseId: string, userId: string) {
  const course = await getCourse(client, courseId);
  const warnings: QueryWarning[] = [];
  const sections: Record<string, unknown> = {};
  for (const [name, load] of [
    ['announcements', () => getCourseAnnouncements(client, courseId)],
    ['contents', () => getCourseContents(client, courseId)],
    ['assignments', () => listAssignments(client, courseId)],
    ['grades', () => getGrades(client, courseId, userId)],
  ] as const) {
    try { sections[name] = await load(); }
    catch (error) { sections[name] = null; warnings.push(queryWarning(name, error, courseId)); }
  }
  return { courseId, course, ...sections, contentsScope: 'root', complete: warnings.length === 0, warnings };
}

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type SearchOptions = { maxItems?: number; maxDepth?: number; maxResults?: number; includeAttachments?: boolean };
type SearchMatch = { courseId: string; contentId: string; title: string; path: string[]; kind: 'content' | 'attachment' | 'embedded' | 'link';
  excerpt?: string; attachmentId?: string; fileName?: string; url?: string; mimeType?: string; extension?: string | null; external?: boolean; linkTitle?: string };

export function publishedLinks(content: any): Array<{ url: string; linkTitle: string; external: boolean }> {
  const links: Array<{ url: string; linkTitle: string; external: boolean }> = [];
  const seen = new Set<string>();
  const add = (value: unknown, title: string) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().startsWith('#')) return;
    try {
      const url = new URL(htmlToText(value), BLACKBOARD_BASE_URL);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
      const external = url.origin !== new URL(BLACKBOARD_BASE_URL).origin;
      if (!external && url.pathname.startsWith('/bbcswebdav/')) return;
      if (seen.has(url.href)) return;
      seen.add(url.href);
      links.push({ url: url.href, linkTitle: title || url.hostname, external });
    } catch { /* A malformed URL is not an actionable link. */ }
  };
  add(content?.contentHandler?.url, typeof content?.title === 'string' ? content.title : 'Enlace del contenido');
  for (const match of contentInstructions(content).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    add(match[1], htmlToText(match[2]));
  }
  return links;
}

const filenameExtension = (value: string) => value.match(/\.([a-z0-9]{1,12})$/i)?.[1].toLowerCase() ?? null;

async function scanContents(client: AxiosInstance, courseId: string, matches: (text: string) => boolean, options: SearchOptions, mode: 'search' | 'files' | 'links' = 'search') {
  const maxItems = options.maxItems ?? 300, maxDepth = options.maxDepth ?? 20, maxResults = options.maxResults ?? 50;
  const results: SearchMatch[] = [], warnings: QueryWarning[] = [];
  const seen = new Set<string>();
  let visited = 0, truncated = false;
  const add = (match: SearchMatch) => { if (results.length < maxResults) results.push(match); else truncated = true; };
  const visit = async (parentId: string | undefined, parents: string[], depth: number): Promise<void> => {
    if (depth > maxDepth) { truncated = true; return; }
    let items: any[];
    try { items = (await getCourseContents(client, courseId, parentId)).results; }
    catch (error) { warnings.push(queryWarning('contents', error, parentId ?? courseId)); return; }
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !/^_\d+_\d+$/.test(item.id)) {
        warnings.push({ section: 'contents', message: 'Blackboard devolvió un contenido sin ID válido.' }); continue;
      }
      if (seen.has(item.id)) continue;
      if (visited >= maxItems) { truncated = true; return; }
      seen.add(item.id); visited++;
      const title = typeof item.title === 'string' ? item.title : item.id;
      const itemPath = [...parents, title];
      const instructions = contentInstructions(item), text = htmlToText(instructions);
      if (mode === 'search' && matches(`${title}\n${text}`)) add({ courseId, contentId: item.id, title, path: itemPath, kind: 'content', excerpt: text.slice(0, 600) });
      if (mode !== 'links') for (const file of embeddedFiles(instructions)) {
        if (matches(file.fileName)) add({ courseId, contentId: item.id, title, path: itemPath, kind: 'embedded', ...file, extension: filenameExtension(file.fileName) });
      }
      if (options.includeAttachments) {
        try {
          for (const file of await attachmentList(client, courseId, item.id, item)) {
            if (matches(file.fileName ?? '')) add({ courseId, contentId: item.id, title, path: itemPath, kind: 'attachment', attachmentId: file.id, fileName: file.fileName,
              mimeType: file.mimeType, extension: filenameExtension(file.fileName ?? '') });
          }
        } catch (error) { warnings.push(queryWarning('attachments', error, item.id)); }
      }
      if (mode === 'links') for (const link of publishedLinks(item)) {
        add({ courseId, contentId: item.id, title, path: itemPath, kind: 'link', ...link });
      }
      if (item.hasChildren === true) await visit(item.id, itemPath, depth + 1);
    }
  };
  await visit(undefined, [], 0);
  return { courseId, results, visited, limits: { maxItems, maxDepth, maxResults }, truncated,
    complete: !truncated && warnings.length === 0, warnings, searchedFileBodies: false };
}

export async function searchContents(client: AxiosInstance, courseId: string, query: string, options: SearchOptions = {}) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('Escribe al menos un término de búsqueda.');
  return { query, ...await scanContents(client, courseId, text => words.every(word => normalized(text).includes(word)), options) };
}

export async function findSyllabus(client: AxiosInstance, courseId: string, options: SearchOptions = {}) {
  const data = await scanContents(client, courseId,
    text => /\b(silabo|syllabus)\b|programa del curso/.test(normalized(text)), { ...options, includeAttachments: true });
  return { ...data, verification: 'Candidatos por título, nombre o texto publicado; verifica el documento y la sección.' };
}

export async function listCourseFiles(client: AxiosInstance, courseId: string, options: SearchOptions & { extensions?: string[] } = {}) {
  const extensions = options.extensions?.map(value => value.toLowerCase()) ?? [];
  const result = await scanContents(client, courseId,
    name => !extensions.length || extensions.includes(filenameExtension(name) ?? ''), { ...options, includeAttachments: true }, 'files');
  return { ...result, extensions, extensionSource: 'fileName', downloadedFiles: false };
}

export async function listCourseLinks(client: AxiosInstance, courseId: string, options: SearchOptions = {}) {
  return { ...await scanContents(client, courseId, () => true, { ...options, includeAttachments: false }, 'links'),
    scope: 'HTTP/HTTPS publicados en contentHandler.url o enlaces del texto; excluye bbcswebdav del host UP', openedExternalLinks: false };
}

export async function searchAnnouncements(client: AxiosInstance, courseId: string, query: string, maxResults = 50) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('Escribe al menos un término de búsqueda.');
  const announcements = (await getCourseAnnouncements(client, courseId)).results;
  const matches = announcements.filter(item => words.every(word =>
    normalized(`${typeof item.title === 'string' ? item.title : ''}\n${htmlToText(typeof item.body === 'string' ? item.body : '')}`).includes(word)));
  return { courseId, query, results: matches.slice(0, maxResults), matched: matches.length, searched: announcements.length,
    truncated: matches.length > maxResults, complete: matches.length <= maxResults };
}

export function validateCalendarRange(since: string, until: string): void {
  const start = Date.parse(since), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 112 * 24 * 60 * 60_000) {
    throw new Error('El intervalo debe ser positivo y no superar 112 días (16 semanas).');
  }
}

export async function courseAgenda(client: AxiosInstance, courseId: string, since: string, until: string) {
  validateCalendarRange(since, until);
  // Validate access to this exact section before aggregating optional sources.
  const course = await getCourse(client, courseId);
  const warnings: QueryWarning[] = [];
  let assignments: GradeColumn[] | null = null, calendar: any[] | null = null;
  try { assignments = await listAssignments(client, courseId); }
  catch (error) { warnings.push(queryWarning('assignments', error, courseId)); }
  try { calendar = (await getCalendarItems(client, since, until, courseId)).results; }
  catch (error) { warnings.push(queryWarning('calendar', error, courseId)); }
  const start = Date.parse(since), end = Date.parse(until);
  const events = [];
  for (const assignment of assignments ?? []) {
    const due = Date.parse(assignment.grading?.due ?? '');
    if (Number.isFinite(due) && due >= start && due < end) events.push({ source: 'assignment', courseId, id: assignment.id,
      title: assignment.name, start: assignment.grading!.due, end: null, completionStatus: 'unknown' });
  }
  for (const item of calendar ?? []) {
    const time = Date.parse(item.start ?? '');
    if (!Number.isFinite(time)) { warnings.push({ section: 'calendar', id: item.id, message: 'Evento sin fecha de inicio válida.' }); continue; }
    // Include overlapping events. A calendar may also represent the same gradebook deadline.
    const parsedEnd = Date.parse(item.end ?? '');
    const finish = Number.isFinite(parsedEnd) ? parsedEnd : time;
    if (time < end && finish >= start) events.push({ source: 'calendar', courseId, id: item.id, title: item.title,
      start: item.start, end: item.end ?? null, type: item.type, description: item.description, recurrence: item.recurrence ?? null });
  }
  events.sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
  return { courseId, course, since, until, timeZone: 'America/Lima', events,
    undatedAssignments: (assignments ?? []).filter(item => !Number.isFinite(Date.parse(item.grading?.due ?? ''))),
    complete: warnings.length === 0, warnings, recurrenceExpanded: false,
    note: 'Fechas publicadas; no determina qué tareas faltan entregar ni el horario completo. Un vencimiento puede figurar en ambas fuentes. No expande recurrencias.' };
}
