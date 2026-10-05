import { readAllPages } from './pagination.js';
import type { AxiosInstance } from 'axios';
import type { Course, UserCourse, PaginatedResponse } from '../types.js';

export async function getMe(client: AxiosInstance): Promise<any> {
  const r = await client.get('/learn/api/public/v1/users/me');
  return r.data;
}

export async function getMyCourses(
  client: AxiosInstance,
  userId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<PaginatedResponse<UserCourse & { course?: Course }>> {
  const params: Record<string, any> = { limit: opts.limit ?? 50 };
  if (opts.offset) params.offset = opts.offset;

  params.expand = 'course';
  const r = await client.get(`/learn/api/public/v1/users/${userId}/courses`, { params });
  return { results: r.data.results, paging: r.data.paging };
}

export async function getCourse(client: AxiosInstance, courseId: string): Promise<Course> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}`);
  return r.data;
}

// listCourses vivía aquí: el catálogo de cursos de toda la institución, que para una sesión de
// estudiante responde 403. Herencia de la CLI original, pensada para docentes. Sin llamador.

export async function getCourseContents(
  client: AxiosInstance,
  courseId: string,
  parentId?: string
): Promise<PaginatedResponse<any>> {
  const path = parentId
    ? `/learn/api/public/v1/courses/${courseId}/contents/${parentId}/children`
    : `/learn/api/public/v1/courses/${courseId}/contents`;
  return readAllPages(client, path, {
    fields: 'id,parentId,title,body,created,modified,position,hasChildren,launchInNewWindow,availability,contentHandler,reviewable',
  });
}

/**
 * One content item, which is where the brief a lecturer wrote actually lives.
 *
 * Not on the gradebook column: that carries the deadline and the points and nothing about what the
 * work is. The column points at a contentId, and the prose sits here — under `body` for a document,
 * under `contentHandler.instructions` for an assignment or test.
 */
export async function getContent(
  client: AxiosInstance,
  courseId: string,
  contentId: string
): Promise<any> {
  const r = await client.get(`/learn/api/public/v1/courses/${courseId}/contents/${contentId}`);
  return r.data;
}

export async function getCourseAnnouncements(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  return readAllPages(client, `/learn/api/public/v1/courses/${courseId}/announcements`);
}

export async function getGradeColumns(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  return readAllPages(client, `/learn/api/public/v1/courses/${courseId}/gradebook/columns`);
}

export async function getGrades(
  client: AxiosInstance,
  courseId: string,
  userId: string
): Promise<PaginatedResponse<any>> {
  return readAllPages(client, `/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}`);
}

export async function getSystemVersion(client: AxiosInstance): Promise<any> {
  const r = await client.get('/learn/api/public/v1/system/version');
  return r.data;
}

/**
 * Which kind each assessment is — Actividad, Examen, Cuestionario, Asistencia.
 *
 * The name only. This was written believing the categories also carried what each kind is worth,
 * and they do not: the official swagger's GradebookCategory has exactly `id` and `title`, checked
 * word by word, and no endpoint in the public gradebook API exposes the percentage a category
 * counts toward the final grade — that lives in a "Total ponderado" column's formula, which the
 * API does not hand over in any readable form. The weight calculation built on this returned null
 * for months and was removed. Do not rebuild it from here; the data is not there to read.
 */
export async function getGradebookCategories(
  client: AxiosInstance,
  courseId: string
): Promise<PaginatedResponse<any>> {
  return readAllPages(client, `/learn/api/public/v1/courses/${courseId}/gradebook/categories`);
}

/**
 * The course's own calendar: class sessions, exams and events a lecturer scheduled.
 *
 * Separate from the gradebook's due dates, and often the only place a midterm's date appears.
 */
export async function getCalendarItems(
  client: AxiosInstance,
  since: string,
  until: string,
  courseId?: string
): Promise<PaginatedResponse<any>> {
  return readAllPages(client, '/learn/api/public/v1/calendars/items', {
    since, until, ...(courseId ? { courseId } : {}),
  });
}
