import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AxiosInstance } from 'axios';
import { getCourse, getGradeColumns, getGrades } from '../api/courses.js';
import { configuredByteLimit, htmlToText } from '../../downloads/course-materials.js';
import { downloadRoot, resolveDownloadDir, writeNamedDownload } from '../../security/files.js';
import { courseAgenda, queryWarning, type QueryWarning } from './course-workflows.js';

const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
const idPattern = /^_\d+_\d+$/;
type Agenda = Awaited<ReturnType<typeof courseAgenda>>;

function calendarText(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** RFC 5545: fold at 75 UTF-8 octets, retaining complete Unicode characters. */
function foldLine(line: string): string {
  const lines = [];
  let current = '', bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += character; bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

const calendarDate = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function agendaIcs(agenda: Pick<Agenda, 'events' | 'complete'> & { courseId?: string; course?: { name?: string } }, generatedAt = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//universidad-pacifico-mcp//Agenda UP//ES',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${calendarText(agenda.course?.name ?? agenda.courseId ?? 'Cursos seleccionados UP')}`,
    'X-WR-TIMEZONE:America/Lima', `X-UP-MCP-COMPLETE:${agenda.complete ? 'TRUE' : 'FALSE'}`];
  const seen = new Set<string>();
  for (const event of agenda.events) {
    if (!event.start || !Number.isFinite(Date.parse(event.start))) throw new Error('No se puede exportar un evento sin fecha válida.');
    const eventCourseId = event.courseId ?? agenda.courseId;
    const key = JSON.stringify([eventCourseId, event.source, event.id ?? event.title, event.start]);
    if (seen.has(key)) continue;
    seen.add(key);
    const uid = `${createHash('sha256').update(key).digest('hex')}@universidad-pacifico-mcp.local`;
    const description = [htmlToText(String(('description' in event ? event.description : '') ?? '')),
      `Fuente: ${event.source}; curso: ${eventCourseId}; ID: ${event.id ?? 'no publicado'}.`,
      'Copia de fechas consultadas. No determina estado de entrega ni expande recurrencias.',
      ...(!agenda.complete ? ['Consulta incompleta: faltan fuentes. Revisa los avisos del resultado MCP.'] : [])].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${calendarDate(generatedAt)}`,
      `DTSTART:${calendarDate(event.start)}`, `SUMMARY:${calendarText(event.title ?? event.id)}`,
      `DESCRIPTION:${calendarText(description)}`);
    if (event.end && Number.isFinite(Date.parse(event.end)) && Date.parse(event.end) > Date.parse(event.start)) lines.push(`DTEND:${calendarDate(event.end)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export async function saveExport(courseId: string, kind: string, extension: string, body: string, outputDir?: string) {
  if (!idPattern.test(courseId) && courseId !== 'seleccion') throw new Error('Identificador inválido para exportación.');
  if (!/^[a-z]+$/.test(kind) || !['ics', 'csv', 'json', 'md'].includes(extension)) throw new Error('Formato de exportación inválido.');
  const directory = resolveDownloadDir(outputDir ?? 'exports');
  const filename = `${kind}-${courseId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const result = await writeNamedDownload(Readable.from([Buffer.from(body, 'utf8')]), directory, filename,
    MAX_EXPORT_BYTES, { root: downloadRoot(), maxBytes: configuredByteLimit('UP_MCP_MAX_TOTAL_BYTES', 500 * 1024 * 1024, 50 * 1024 * 1024 * 1024) });
  return { ...result, filename };
}

export async function exportCourseAgenda(client: AxiosInstance, courseId: string, since: string, until: string, options: { outputDir?: string; allowPartial?: boolean } = {}) {
  const agenda = await courseAgenda(client, courseId, since, until);
  if (!agenda.complete && !options.allowPartial) throw new Error('Agenda incompleta. Consulta sus avisos con blackboard_get_course_agenda; usa allowPartial=true si deseas exportarla igualmente.');
  const body = agendaIcs(agenda);
  return { courseId, format: 'ics', ...await saveExport(courseId, 'agenda', 'ics', body, options.outputDir),
    eventCount: (body.match(/BEGIN:VEVENT\r\n/g) ?? []).length, complete: agenda.complete, warnings: agenda.warnings,
    recurrenceExpanded: false, synced: false, note: agenda.note };
}

/** CSV text fields are data, never formulas supplied by course content. */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '""';
  let text = String(value);
  if (typeof value === 'string' && (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const numberOrBlank = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : '';
const stringOrBlank = (value: unknown) => typeof value === 'string' ? value : '';

export function gradesCsv(course: { id: string; name?: string }, columns: any[], grades: any[]): string {
  const byColumn = new Map<string, any>();
  for (const grade of grades) {
    if (!grade || !idPattern.test(grade.columnId ?? '')) throw new Error('Blackboard devolvió una nota sin columnId válido.');
    if (byColumn.has(grade.columnId)) throw new Error('Blackboard devolvió notas duplicadas para la misma columna.');
    byColumn.set(grade.columnId, grade);
  }
  const byId = new Map<string, any>();
  for (const column of columns) {
    if (!column || !idPattern.test(column.id ?? '')) throw new Error('Blackboard devolvió una columna sin ID válido.');
    byId.set(column.id, column);
  }
  const ids = new Set([...byId.keys(), ...byColumn.keys()]);
  const rows: unknown[][] = [['course_id', 'course_name', 'column_id', 'column_name', 'score', 'display_score', 'column_possible',
    'display_possible', 'text', 'display_text', 'status', 'exempt', 'feedback']];
  for (const columnId of ids) {
    const column = byId.get(columnId), grade = byColumn.get(columnId);
    rows.push([course.id, course.name ?? '', columnId, stringOrBlank(column?.name), numberOrBlank(grade?.score),
      numberOrBlank(grade?.displayGrade?.score), numberOrBlank(column?.score?.possible), numberOrBlank(grade?.displayGrade?.possible),
      stringOrBlank(grade?.text), stringOrBlank(grade?.displayGrade?.text), stringOrBlank(grade?.status),
      typeof grade?.exempt === 'boolean' ? grade.exempt : '', htmlToText(stringOrBlank(grade?.feedback))]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function exportCourseGrades(client: AxiosInstance, courseId: string, userId: string, options: { outputDir?: string; allowPartial?: boolean } = {}) {
  const course = await getCourse(client, courseId);
  // A failed grades request must never produce an apparent empty report.
  const grades = (await getGrades(client, courseId, userId)).results;
  if (grades.some((grade: any) => grade?.userId && grade.userId !== userId)) throw new Error('Blackboard devolvió notas asociadas a otra cuenta. No se exportaron.');
  const warnings: QueryWarning[] = [];
  let columns: any[] = [];
  try { columns = (await getGradeColumns(client, courseId)).results; }
  catch (error) { warnings.push(queryWarning('gradeColumns', error, courseId)); }
  if (warnings.length && !options.allowPartial) throw new Error('No se pudieron consultar las columnas de notas. Usa allowPartial=true para exportar las notas accesibles sin esa información.');
  const body = gradesCsv({ id: courseId, name: course.name }, columns, grades);
  const rowCount = new Set([...columns.map(column => column.id), ...grades.map(grade => (grade as any).columnId)]).size;
  return { courseId, format: 'csv', ...await saveExport(courseId, 'notas', 'csv', body, options.outputDir),
    rowCount, complete: warnings.length === 0, warnings, calculatedFinalGrade: false,
    note: 'Datos privados de la cuenta autenticada. Las celdas sin nota quedan vacías; no se calculan ponderaciones ni certificaciones.' };
}
