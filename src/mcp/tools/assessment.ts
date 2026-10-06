import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAttempt, getAttemptFiles, listAssignments, listAttempts } from '../../blackboard/api/assignments.js';
import { getGradeColumns, getGradebookCategories, getGrades, getMe } from '../../blackboard/api/courses.js';
import { z } from 'zod';
import { assignmentDetails, assignmentFeedback } from '../../blackboard/services/course-workflows.js';
import { gradeDetail } from '../../blackboard/services/participation.js';
import { gradePeriods } from '../../blackboard/api/student.js';
import { courseGradebook, multiGradebook, submissionReceipts } from '../../blackboard/services/student.js';
import { type GetClient, READ_ONLY, accountId, blackboardId, course, courseIdentifier, courseIds, textResult, toolRegistrar } from './context.js';
export function registerAssessmentTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_list_assignments', { annotations: READ_ONLY, description: 'Actividades evaluables Attempts/Manual con fechas y puntajes publicados; no determina si falta entregar', inputSchema: { courseId: blackboardId('courseId') } }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await listAssignments(client, courseId));
    });
    server.registerTool('blackboard_list_attempts', {
        description: 'Intentos de una tarea',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId') },
    }, async ({ courseId, columnId }) => {
        const { client } = await getClient();
        return textResult(await listAttempts(client, courseId, columnId));
    });
    server.registerTool('blackboard_get_grades', { annotations: READ_ONLY, description: 'Calificaciones del estudiante en un curso', inputSchema: { courseId: blackboardId('courseId') } }, async ({ courseId }) => {
        const { client, session } = await getClient();
        const userId = session.userId ?? (await getMe(client)).id;
        return textResult(await getGrades(client, courseId, userId));
    });
    server.registerTool('blackboard_get_grade_columns', {
        description: 'Columnas de calificaciones y puntajes máximos. No contiene necesariamente las ponderaciones del sílabo.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await getGradeColumns(client, courseId));
    });
    server.registerTool('blackboard_get_assignment_feedback', {
        description: 'Último intento accesible por actividad, nota y comentarios. includeAttemptFiles=true consulta además archivos asociados, que pueden tener permisos diferentes y no son necesariamente retroalimentación del docente.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), includeAttemptFiles: z.boolean().optional() },
    }, async ({ courseId, includeAttemptFiles }) => {
        const { client } = await getClient();
        return textResult(await assignmentFeedback(client, courseId, includeAttemptFiles));
    });
    server.registerTool('blackboard_get_assignment_details', {
        description: 'Reúne metadatos de una actividad, instrucciones de su contenido, adjuntos e intentos accesibles; informa consultas incompletas.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId') },
    }, async ({ courseId, columnId }) => {
        const { client } = await getClient();
        return textResult(await assignmentDetails(client, courseId, columnId));
    });
    server.registerTool('blackboard_get_attempt', {
        description: 'Consulta un intento ya existente mediante sus IDs; respeta los permisos de la cuenta.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId'), attemptId: blackboardId('attemptId') },
    }, async ({ courseId, columnId, attemptId }) => {
        const { client } = await getClient();
        return textResult(await getAttempt(client, courseId, columnId, attemptId));
    });
    server.registerTool('blackboard_list_attempt_files', {
        description: 'Lista archivos asociados a un intento; no los identifica automáticamente como correcciones del docente.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId'), attemptId: blackboardId('attemptId') },
    }, async ({ courseId, columnId, attemptId }) => {
        const { client } = await getClient();
        return textResult(await getAttemptFiles(client, courseId, columnId, attemptId));
    });
    server.registerTool('blackboard_get_grade_categories', {
        description: 'Categorías publicadas del libro de notas (id y título); no proporciona porcentajes ni calcula la nota final.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
    }, async ({ courseId }) => {
        const { client } = await getClient();
        return textResult(await getGradebookCategories(client, courseId));
    });
    server.registerTool('blackboard_get_grade_detail', {
        description: 'Nota propia de una columna: displayGrade, comentarios, exención, metadatos e intentos accesibles. grade.status es un campo histórico no fiable; no calcula nota final ni estado de entrega.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId'), includeAttempts: z.boolean().optional() },
    }, async ({ courseId, columnId, includeAttempts }) => {
        const { client, session } = await getClient();
        return textResult(await gradeDetail(client, courseId, columnId, await accountId(client, session), includeAttempts));
    });
    register('list_grade_periods', 'Periodos de evaluación configurados en el libro de notas del curso. Pueden estar vacíos; no determina el periodo oficial de matrícula.', course, async (args) => gradePeriods((await getClient()).client, args.courseId));
    register('get_submission_receipts', 'Comprobantes publicados de tus intentos en una actividad. Un comprobante ausente no demuestra falta de entrega; no crea comprobantes.', { ...course, columnId: courseIdentifier }, async (args) => { const { client, session } = await getClient(); return submissionReceipts(client, args.courseId, args.columnId, await accountId(client, session)); });
    register('get_course_gradebook', 'Une tus notas, columnas y categorías de la sección. Preserva null y puntajes cero; no calcula ponderaciones ni promedios.', course, async (args) => { const { client, session } = await getClient(); return courseGradebook(client, args.courseId, await accountId(client, session)); });
    register('get_multi_course_gradebook', 'Consulta libros de notas propios de 1 a 10 cursos elegidos por ID, con avisos por fuente. No mezcla secciones ni calcula promedio general.', { courseIds }, async (args) => { const { client, session } = await getClient(); return multiGradebook(client, args.courseIds, await accountId(client, session)); });
}
