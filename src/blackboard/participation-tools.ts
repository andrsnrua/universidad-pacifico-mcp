import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import type { Session } from './types.js';
import { getMe } from './api/courses.js';
import { getDiscussion, getGroup, listDiscussions, listDiscussionMessages, listGroups, listGroupSets, listCourseMeetings } from './api/participation.js';
import { contentReviewStatus, gradeDetail, multiCourseAgenda, ownAttendance, ownEnrollment } from './services/participation.js';
import { validateCalendarRange } from './services/course-workflows.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const id = (name: string) => z.string().regex(/^_\d+_\d+$/, `${name} debe tener la forma _12345_1`);
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
type GetClient = () => Promise<{ client: AxiosInstance; session: Session }>;
async function accountId(client: AxiosInstance, session: Session): Promise<string> {
  const userId = session.userId ?? (await getMe(client)).id;
  if (typeof userId !== 'string' || !/^_\d+_\d+$/.test(userId)) throw new Error('No se pudo identificar la cuenta autenticada.');
  return userId;
}

export function registerParticipationTools(server: McpServer, getClient: GetClient) {
  server.registerTool('blackboard_list_discussions', {
    description: 'Discusiones accesibles de un curso Ultra. Puede filtrar título y si son evaluables; no publica mensajes ni garantiza foros en cursos Original.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), title: z.string().trim().min(1).max(200).optional(), gradable: z.boolean().optional() },
  }, async ({ courseId, ...options }) => {
    const { client } = await getClient(); return result(await listDiscussions(client, courseId, options));
  });

  server.registerTool('blackboard_get_discussion', {
    description: 'Detalle y tema publicado de una discusión Ultra accesible.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), discussionId: id('discussionId') },
  }, async ({ courseId, discussionId }) => {
    const { client } = await getClient(); return result(await getDiscussion(client, courseId, discussionId));
  });

  const messageFilters = { groupId: id('groupId').optional(), onlyMine: z.boolean().optional(), status: z.enum(['Published', 'Deleted', 'Draft']).optional() };
  server.registerTool('blackboard_list_discussion_messages', {
    description: 'Mensajes accesibles de una discusión Ultra; publicados por defecto. onlyMine limita a la cuenta actual. Respeta los grupos y permisos de Blackboard; no marca mensajes como leídos.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), discussionId: id('discussionId'), ...messageFilters },
  }, async ({ courseId, discussionId, groupId, onlyMine, status }) => {
    const { client, session } = await getClient();
    return result(await listDiscussionMessages(client, courseId, discussionId, {
      ...(groupId ? { groupId } : {}), ...(onlyMine ? { userId: await accountId(client, session) } : {}), status: status ?? 'Published',
    }));
  });

  server.registerTool('blackboard_list_discussion_replies', {
    description: 'Respuestas accesibles a un mensaje de discusión Ultra, conservando parentId y threadId. No envía respuestas.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), discussionId: id('discussionId'), messageId: id('messageId'), ...messageFilters },
  }, async ({ courseId, discussionId, messageId, groupId, onlyMine, status }) => {
    const { client, session } = await getClient();
    return result(await listDiscussionMessages(client, courseId, discussionId, {
      ...(groupId ? { groupId } : {}), ...(onlyMine ? { userId: await accountId(client, session) } : {}), status: status ?? 'Published',
    }, messageId));
  });

  server.registerTool('blackboard_list_groups', {
    description: 'Grupos que Blackboard permite consultar en el curso, con filtro de nombre y si pertenecen a un conjunto. No determina tu pertenencia, lista integrantes ni inscribe estudiantes.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), name: z.string().trim().min(1).max(200).optional(), inGroupSet: z.boolean().optional() },
  }, async ({ courseId, ...options }) => {
    const { client } = await getClient(); return result(await listGroups(client, courseId, options));
  });

  server.registerTool('blackboard_get_group', {
    description: 'Descripción, disponibilidad y configuración publicada de un grupo accesible. No acredita pertenencia ni cambia la inscripción.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), groupId: id('groupId') },
  }, async ({ courseId, groupId }) => {
    const { client } = await getClient(); return result(await getGroup(client, courseId, groupId));
  });

  server.registerTool('blackboard_list_group_sets', {
    description: 'Conjuntos de grupos publicados en un curso, mediante groups/sets. La lista no garantiza acceso a detalles o integrantes.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId') },
  }, async ({ courseId }) => {
    const { client } = await getClient(); return result(await listGroupSets(client, courseId));
  });

  server.registerTool('blackboard_list_course_meetings', {
    description: 'Sesiones registradas en la herramienta de asistencia del curso. No equivale al horario académico completo ni confirma presencia.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId') },
  }, async ({ courseId }) => {
    const { client } = await getClient(); return result(await listCourseMeetings(client, courseId));
  });

  server.registerTool('blackboard_get_my_attendance', {
    description: 'Asistencia de la cuenta actual, filtrada por los IDs de sesiones de este curso. Un registro ausente se muestra como null, no como falta. Señala fuentes inaccesibles.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId') },
  }, async ({ courseId }) => {
    const { client, session } = await getClient(); const user = await getMe(client);
    const userId = await accountId(client, { ...session, userId: user.id });
    return result(await ownAttendance(client, courseId, { id: userId, ...(typeof user.externalId === 'string' ? { externalId: user.externalId } : {}) }));
  });

  server.registerTool('blackboard_get_my_enrollment', {
    description: 'Inscripción, rol y condiciones publicadas de la cuenta actual en un curso de Blackboard. No certifica matrícula académica ni consulta pagos o créditos.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId') },
  }, async ({ courseId }) => {
    const { client, session } = await getClient(); return result(await ownEnrollment(client, courseId, await accountId(client, session)));
  });

  server.registerTool('blackboard_get_grade_detail', {
    description: 'Nota propia de una columna: displayGrade, comentarios, exención, metadatos e intentos accesibles. grade.status es un campo histórico no fiable; no calcula nota final ni estado de entrega.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), columnId: id('columnId'), includeAttempts: z.boolean().optional() },
  }, async ({ courseId, columnId, includeAttempts }) => {
    const { client, session } = await getClient(); return result(await gradeDetail(client, courseId, columnId, await accountId(client, session), includeAttempts));
  });

  server.registerTool('blackboard_get_content_review_status', {
    description: 'Lee el estado de revisión propio de un contenido configurado como revisable. No lo marca como revisado; un contenido no revisable no se interpreta como pendiente.',
    annotations: READ_ONLY, inputSchema: { courseId: id('courseId'), contentId: id('contentId') },
  }, async ({ courseId, contentId }) => {
    const { client, session } = await getClient(); return result(await contentReviewStatus(client, courseId, contentId, await accountId(client, session)));
  });

  server.registerTool('blackboard_get_multi_course_agenda', {
    description: 'Agenda combinada y ordenada de 1 a 10 cursos elegidos por ID, con fechas publicadas y avisos por curso. Máximo 112 días; no determina entregas pendientes ni mezcla secciones por nombre.',
    annotations: READ_ONLY, inputSchema: { courseIds: z.array(id('courseId')).min(1).max(10), since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) },
  }, async ({ courseIds, since, until }) => {
    validateCalendarRange(since, until); const { client } = await getClient();
    return result(await multiCourseAgenda(client, courseIds, since, until));
  });
}
