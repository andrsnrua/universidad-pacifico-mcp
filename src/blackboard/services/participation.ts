import type { AxiosInstance } from 'axios';
import { getContent } from '../api/courses.js';
import { listAttempts } from '../api/assignments.js';
import { attendanceByUser, getColumn, getContentReview, getOwnColumnGrade, getOwnEnrollment, listCourseMeetings, type AttendanceRecord } from '../api/participation.js';
import { courseAgenda, queryWarning, validateCalendarRange, type QueryWarning } from './course-workflows.js';

function assertField(data: unknown, key: string, expected: string, message: string) {
  const value = (data as Record<string, unknown> | null)?.[key];
  if (value !== undefined && value !== expected) throw new Error(message);
}

export async function ownEnrollment(client: AxiosInstance, courseId: string, userId: string) {
  const enrollment = await getOwnEnrollment(client, courseId, userId);
  assertField(enrollment, 'userId', userId, 'Blackboard devolvió una matrícula de otra cuenta.');
  assertField(enrollment, 'courseId', courseId, 'Blackboard devolvió una matrícula de otro curso.');
  return { courseId, userId, enrollment, scope: 'blackboard_course',
    note: 'Inscripción en Aula Virtual; no certifica matrícula académica, pagos ni créditos.' };
}

export async function ownAttendance(client: AxiosInstance, courseId: string, user: { id: string; externalId?: string }) {
  const meetings = (await listCourseMeetings(client, courseId)).results;
  for (const meeting of meetings) {
    assertField(meeting, 'courseId', courseId, 'Blackboard devolvió una sesión de otro curso.');
    if (!meeting.id) throw new Error('Blackboard devolvió una sesión sin identificador.');
  }
  const warnings: QueryWarning[] = [];
  let records: AttendanceRecord[] | null = null;
  try { records = (await attendanceByUser(client, courseId, user.id)).results; }
  catch (error) { warnings.push(queryWarning('attendance', error, courseId)); }
  const ownIds = new Set([user.id, ...(user.externalId ? [user.externalId] : [])]);
  const meetingIds = new Set(meetings.map(meeting => String(meeting.id)));
  const byMeeting = new Map<string, AttendanceRecord>();
  for (const record of records ?? []) {
    if (record.userId !== undefined && !ownIds.has(record.userId)) throw new Error('Blackboard devolvió asistencia de otra cuenta.');
    if (!record.meetingId) throw new Error('Blackboard devolvió asistencia sin identificador de sesión.');
    const meetingId = String(record.meetingId);
    if (!meetingIds.has(meetingId)) continue;
    if (byMeeting.has(meetingId)) throw new Error('Blackboard devolvió asistencia duplicada para una sesión.');
    byMeeting.set(meetingId, record);
  }
  const results = meetings.map(meeting => ({ meeting, attendance: byMeeting.get(String(meeting.id)) ?? null }));
  return { courseId, userId: user.id, scope: 'course', timeZone: 'America/Lima', results,
    missingRecords: results.filter(item => item.attendance === null).length, complete: warnings.length === 0, warnings,
    note: 'Solo sesiones publicadas de este curso. Un registro ausente no significa inasistencia; no representa el horario completo.' };
}

export async function gradeDetail(client: AxiosInstance, courseId: string, columnId: string, userId: string, includeAttempts = true) {
  const grade = await getOwnColumnGrade(client, courseId, columnId, userId);
  assertField(grade, 'userId', userId, 'Blackboard devolvió una nota de otra cuenta.');
  assertField(grade, 'columnId', columnId, 'Blackboard devolvió una nota de otra columna.');
  const warnings: QueryWarning[] = [];
  let column: Awaited<ReturnType<typeof getColumn>> | null = null;
  try { column = await getColumn(client, courseId, columnId); }
  catch (error) { warnings.push(queryWarning('column', error, columnId)); }
  if (column) assertField(column, 'id', columnId, 'Blackboard devolvió otra columna.');
  let attempts: Awaited<ReturnType<typeof listAttempts>> | null = null;
  const attemptsRequested = includeAttempts && column?.grading?.type === 'Attempts';
  if (attemptsRequested) {
    try { attempts = await listAttempts(client, courseId, columnId); }
    catch (error) { warnings.push(queryWarning('attempts', error, columnId)); }
    if (attempts?.some(attempt => attempt.userId !== undefined && attempt.userId !== userId)) {
      throw new Error('Blackboard devolvió intentos de otra cuenta.');
    }
  }
  return { courseId, columnId, userId, grade, column, attempts, attemptsRequested,
    complete: warnings.length === 0, warnings, gradeStatusReliable: false,
    note: 'El campo histórico grade.status está deprecado y no es fiable. Conserva puntajes, displayGrade y estados de intentos sin inferir entregas pendientes ni promedio final.' };
}

export async function contentReviewStatus(client: AxiosInstance, courseId: string, contentId: string, userId: string) {
  const content = await getContent(client, courseId, contentId);
  assertField(content, 'id', contentId, 'Blackboard devolvió otro contenido.');
  if (content.reviewable === false) {
    return { courseId, contentId, userId, supported: false, reviewed: null, review: null,
      note: 'El contenido no está configurado como revisable; no se infiere que esté pendiente.' };
  }
  const review = await getContentReview(client, courseId, contentId, userId);
  assertField(review, 'userId', userId, 'Blackboard devolvió una revisión de otra cuenta.');
  assertField(review, 'contentId', contentId, 'Blackboard devolvió una revisión de otro contenido.');
  return { courseId, contentId, userId, supported: true, reviewed: typeof review.reviewed === 'boolean' ? review.reviewed : null, review,
    note: 'Estado publicado por Blackboard; esta consulta no marca el contenido como revisado ni acredita su comprensión.' };
}

export async function multiCourseAgenda(client: AxiosInstance, courseIds: string[], since: string, until: string) {
  validateCalendarRange(since, until);
  const ids = [...new Set(courseIds)];
  if (!ids.length || ids.length > 10 || ids.some(id => !/^_\d+_\d+$/.test(id))) throw new Error('Selecciona entre 1 y 10 IDs de curso válidos.');
  const courses: Array<{ courseId: string; agenda: Awaited<ReturnType<typeof courseAgenda>> | null }> = [];
  const warnings: QueryWarning[] = [];
  for (const courseId of ids) {
    try {
      const agenda = await courseAgenda(client, courseId, since, until);
      courses.push({ courseId, agenda });
      warnings.push(...agenda.warnings);
    } catch (error) {
      courses.push({ courseId, agenda: null }); warnings.push(queryWarning('course', error, courseId));
    }
  }
  const events = courses.flatMap(item => item.agenda?.events ?? []);
  events.sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
  return { since, until, timeZone: 'America/Lima', courseIds: ids, courses, events,
    complete: warnings.length === 0, warnings, recurrenceExpanded: false,
    note: 'Agenda de los cursos seleccionados por ID; una fuente restringida no se considera un curso sin eventos. No determina entregas pendientes.' };
}
