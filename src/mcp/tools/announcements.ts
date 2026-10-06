import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCourseAnnouncements } from '../../blackboard/api/courses.js';
import { z } from 'zod';
import { searchAnnouncements } from '../../blackboard/services/course-workflows.js';
import { announcement, institutionAnnouncements } from '../../blackboard/api/student.js';
import { multiAnnouncementSearch } from '../../blackboard/services/student.js';
import { type GetClient, READ_ONLY, blackboardId, course, courseIdentifier, courseIds, maxResults, query, textResult, toolRegistrar } from './context.js';
export function registerAnnouncementsTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_list_announcements', { annotations: READ_ONLY, description: 'Anuncios del curso', inputSchema: { courseId: blackboardId('courseId') } }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await getCourseAnnouncements(client, courseId));
    });
    server.registerTool('blackboard_search_announcements', {
        description: 'Busca todos los términos en títulos y texto de anuncios accesibles del curso, ignorando tildes y mayúsculas.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), query: z.string().trim().min(1).max(200), maxResults: z.number().int().min(1).max(100).optional() },
    }, async ({ courseId, query, maxResults }) => {
        const { client } = await getClient();
        return textResult(await searchAnnouncements(client, courseId, query, maxResults));
    });
    register('list_institution_announcements', 'Anuncios institucionales que Aula Virtual UP permite ver; título y vencidos opcionales. Un resultado vacío no equivale a error de permisos.', { title: z.string().trim().min(1).max(200).optional(), includeExpired: z.boolean().optional() }, async (options) => institutionAnnouncements((await getClient()).client, options));
    register('get_announcement', 'Texto y fechas de un anuncio accesible de la sección indicada.', { ...course, announcementId: courseIdentifier }, async (args) => announcement((await getClient()).client, args.courseId, args.announcementId));
    register('search_multi_course_announcements', 'Busca términos en anuncios de 1 a 10 secciones, conserva courseId y señala cursos no consultados o restringidos.', { courseIds, query, maxResults }, async (args) => multiAnnouncementSearch((await getClient()).client, args.courseIds, args.query, args.maxResults));
}
