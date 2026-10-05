import type { AxiosInstance } from 'axios';
import { agendaIcs, csvCell, saveExport } from './exports.js';
import { multiCourseAgenda, ownAttendance } from './participation.js';
import { courseOutline, multiGradebook, studyBrief, submissionReceipts, type OutlineOptions } from './student.js';

export type ExportOptions = { outputDir?: string; allowPartial?: boolean };
function requireComplete(data: { complete?: boolean }, options: ExportOptions) {
  if (data.complete === false && !options.allowPartial) throw new Error('Consulta incompleta. Revisa los avisos con la herramienta de consulta; usa allowPartial=true para guardar una copia parcial.');
}
function csv(rows: unknown[][]) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
export async function exportMultiAgenda(client: AxiosInstance, courseIds: string[], since: string, until: string, options: ExportOptions = {}) {
  const data = await multiCourseAgenda(client, courseIds, since, until); requireComplete(data, options);
  const body = agendaIcs(data);
  return { ...await saveExport('seleccion', 'agenda', 'ics', body, options.outputDir), courseIds: data.courseIds, complete: data.complete, warnings: data.warnings,
    eventCount: (body.match(/BEGIN:VEVENT\r\n/g) ?? []).length, recurrenceExpanded: false, synced: false };
}
export async function exportAttendance(client: AxiosInstance, courseId: string, user: { id: string; externalId?: string }, options: ExportOptions = {}) {
  const data = await ownAttendance(client, courseId, user); requireComplete(data, options);
  const rows: unknown[][] = [['course_id', 'meeting_id', 'status', 'record_published']];
  for (const item of data.results) rows.push([courseId, item.meeting.id, item.attendance?.status ?? '', item.attendance !== null]);
  return { ...await saveExport(courseId, 'asistencia', 'csv', csv(rows), options.outputDir), courseId, rowCount: data.results.length, complete: data.complete, warnings: data.warnings, note: data.note };
}
export async function exportOutline(client: AxiosInstance, courseId: string, options: ExportOptions & OutlineOptions = {}) {
  const data = await courseOutline(client, courseId, options); requireComplete(data, options);
  return { ...await saveExport(courseId, 'estructura', 'json', JSON.stringify(data, null, 2), options.outputDir), courseId, rowCount: data.results.length, complete: data.complete, warnings: data.warnings };
}
export async function exportBrief(client: AxiosInstance, courseId: string, since: string, until: string, options: ExportOptions = {}) {
  const data = await studyBrief(client, courseId, since, until); requireComplete(data, options);
  return { ...await saveExport(courseId, 'resumen', 'md', data.markdown, options.outputDir), courseId, complete: data.complete, warnings: data.warnings };
}
export async function exportReceipts(client: AxiosInstance, courseId: string, columnId: string, userId: string, options: ExportOptions = {}) {
  const data = await submissionReceipts(client, courseId, columnId, userId);
  const rows: unknown[][] = [['course_id', 'column_id', 'attempt_id', 'attempt_status', 'receipt_id', 'submission_date', 'submission_bytes', 'receipt_published']];
  for (const item of data.results) rows.push([courseId, columnId, item.attemptId, item.status, item.receipt?.receiptId ?? '', item.receipt?.submissionDate ?? '', item.receipt?.submissionTotalSize ?? '', item.receipt !== null]);
  return { ...await saveExport(courseId, 'comprobantes', 'csv', csv(rows), options.outputDir), courseId, columnId, rowCount: data.results.length, note: data.note };
}
export async function exportMultiGrades(client: AxiosInstance, courseIds: string[], userId: string, options: ExportOptions = {}) {
  const data = await multiGradebook(client, courseIds, userId); requireComplete(data, options);
  const rows: unknown[][] = [['course_id', 'course_name', 'column_id', 'column_name', 'category_title', 'score', 'display_score', 'display_text', 'column_possible', 'grade_published']];
  for (const item of data.courses) for (const entry of item.gradebook?.results ?? []) rows.push([item.courseId, item.gradebook.course.name ?? '', entry.columnId,
    entry.column?.name ?? '', entry.category?.title ?? '', entry.grade?.score ?? '', entry.grade?.displayGrade?.score ?? '', entry.grade?.displayGrade?.text ?? '', entry.column?.score?.possible ?? '', entry.grade !== null]);
  return { ...await saveExport('seleccion', 'notas', 'csv', csv(rows), options.outputDir), courseIds: data.courseIds, rowCount: rows.length - 1, complete: data.complete, warnings: data.warnings, calculatedFinalGrade: false };
}
