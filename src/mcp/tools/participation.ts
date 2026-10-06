import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDiscussion, getGroup, listCourseMeetings, listDiscussionMessages, listDiscussions, listGroupSets, listGroups } from '../../blackboard/api/participation.js';
import { getMe } from '../../blackboard/api/courses.js';
import { ownAttendance } from '../../blackboard/services/participation.js';
import { type GetClient, READ_ONLY, accountId, blackboardId, messageFilters, textResult } from './context.js';
export function registerParticipationTools(server: McpServer, getClient: GetClient): void {
    server.registerTool('blackboard_list_discussions', {
        description: 'Discusiones accesibles de un curso Ultra. Puede filtrar título y si son evaluables; no publica mensajes ni garantiza foros en cursos Original.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), title: z.string().trim().min(1).max(200).optional(), gradable: z.boolean().optional() },
    }, async ({ courseId, ...options }) => {
        const { client } = await getClient();
        return textResult(await listDiscussions(client, courseId, options));
    });
    server.registerTool('blackboard_get_discussion', {
        description: 'Detalle y tema publicado de una discusión Ultra accesible.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), discussionId: blackboardId('discussionId') },
    }, async ({ courseId, discussionId }) => {
        const { client } = await getClient();
        return textResult(await getDiscussion(client, courseId, discussionId));
    });
    server.registerTool('blackboard_list_discussion_messages', {
        description: 'Mensajes accesibles de una discusión Ultra; publicados por defecto. onlyMine limita a la cuenta actual. Respeta los grupos y permisos de Blackboard; no marca mensajes como leídos.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), discussionId: blackboardId('discussionId'), ...messageFilters },
    }, async ({ courseId, discussionId, groupId, onlyMine, status }) => {
        const { client, session } = await getClient();
        return textResult(await listDiscussionMessages(client, courseId, discussionId, {
            ...(groupId ? { groupId } : {}), ...(onlyMine ? { userId: await accountId(client, session) } : {}), status: status ?? 'Published',
        }));
    });
    server.registerTool('blackboard_list_discussion_replies', {
        description: 'Respuestas accesibles a un mensaje de discusión Ultra, conservando parentId y threadId. No envía respuestas.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), discussionId: blackboardId('discussionId'), messageId: blackboardId('messageId'), ...messageFilters },
    }, async ({ courseId, discussionId, messageId, groupId, onlyMine, status }) => {
        const { client, session } = await getClient();
        return textResult(await listDiscussionMessages(client, courseId, discussionId, {
            ...(groupId ? { groupId } : {}), ...(onlyMine ? { userId: await accountId(client, session) } : {}), status: status ?? 'Published',
        }, messageId));
    });
    server.registerTool('blackboard_list_groups', {
        description: 'Grupos que Blackboard permite consultar en el curso, con filtro de nombre y si pertenecen a un conjunto. No determina tu pertenencia, lista integrantes ni inscribe estudiantes.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), name: z.string().trim().min(1).max(200).optional(), inGroupSet: z.boolean().optional() },
    }, async ({ courseId, ...options }) => {
        const { client } = await getClient();
        return textResult(await listGroups(client, courseId, options));
    });
    server.registerTool('blackboard_get_group', {
        description: 'Descripción, disponibilidad y configuración publicada de un grupo accesible. No acredita pertenencia ni cambia la inscripción.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), groupId: blackboardId('groupId') },
    }, async ({ courseId, groupId }) => {
        const { client } = await getClient();
        return textResult(await getGroup(client, courseId, groupId));
    });
    server.registerTool('blackboard_list_group_sets', {
        description: 'Conjuntos de grupos publicados en un curso, mediante groups/sets. La lista no garantiza acceso a detalles o integrantes.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await listGroupSets(client, courseId));
    });
    server.registerTool('blackboard_list_course_meetings', {
        description: 'Sesiones registradas en la herramienta de asistencia del curso. No equivale al horario académico completo ni confirma presencia.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await listCourseMeetings(client, courseId));
    });
    server.registerTool('blackboard_get_my_attendance', {
        description: 'Asistencia de la cuenta actual, filtrada por los IDs de sesiones de este curso. Un registro ausente se muestra como null, no como falta. Señala fuentes inaccesibles.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client, session } = await getClient();
        const user = await getMe(client);
        const userId = await accountId(client, { ...session, userId: user.id });
        return textResult(await ownAttendance(client, courseId, { id: userId, ...(typeof user.externalId === 'string' ? { externalId: user.externalId } : {}) }));
    });
}
