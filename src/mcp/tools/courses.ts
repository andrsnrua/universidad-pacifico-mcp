import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCourse, getMe } from '../../blackboard/api/courses.js';
import { readAllPages } from '../../blackboard/api/pagination.js';
import { courseOverview, validateCalendarRange } from '../../blackboard/services/course-workflows.js';
import { z } from 'zod';
import { multiOverview, studyBrief } from '../../blackboard/services/student.js';
import { ownEnrollment } from '../../blackboard/services/participation.js';
import { type GetClient, READ_ONLY, accountId, blackboardId, course, courseIdentifier, range, textResult, toolRegistrar } from './context.js';
export function registerCoursesTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_list_courses', { annotations: READ_ONLY, description: 'Cursos asociados a la cuenta autenticada, respetando los permisos de Blackboard' }, async () => {
        const { client, session } = await getClient();
        const userId = session.userId ?? (await getMe(client)).id;
        return textResult(await readAllPages(client, `/learn/api/public/v1/users/${userId}/courses`, { expand: 'course' }));
    });
    server.registerTool('blackboard_get_course', { annotations: READ_ONLY, description: 'Detalle de un curso', inputSchema: { courseId: blackboardId('courseId') } }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await getCourse(client, courseId));
    });
    server.registerTool('blackboard_get_course_overview', {
        description: 'Reúne detalle del curso, anuncios, contenidos raíz, actividades y notas; señala fuentes no accesibles.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client, session } = await getClient();
        const userId = session.userId ?? (await getMe(client)).id;
        return textResult(await courseOverview(client, courseId, userId));
    });
    register('get_multi_course_overview', 'Panorama de 1 a 5 cursos elegidos: anuncios, raíz de contenidos, actividades y notas propias. Conserva resultados parciales por sección.', { courseIds: z.array(courseIdentifier).min(1).max(5) }, async (args) => { const { client, session } = await getClient(); return multiOverview(client, args.courseIds, await accountId(client, session)); });
    server.registerTool('blackboard_get_my_enrollment', {
        description: 'Inscripción, rol y condiciones publicadas de la cuenta actual en un curso de Blackboard. No certifica matrícula académica ni consulta pagos o créditos.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client, session } = await getClient();
        return textResult(await ownEnrollment(client, courseId, await accountId(client, session)));
    });
    register('get_study_brief', 'Resumen basado en fechas publicadas y candidatos a sílabo, con fuentes y avisos. No supone tareas pendientes ni inventa disponibilidad de estudio.', { ...course, ...range }, async (args) => { validateCalendarRange(args.since, args.until); return studyBrief((await getClient()).client, args.courseId, args.since, args.until); });
}
