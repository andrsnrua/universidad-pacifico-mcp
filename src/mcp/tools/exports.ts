import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateCalendarRange } from '../../blackboard/services/course-workflows.js';
import { exportCourseAgenda, exportCourseGrades } from '../../blackboard/services/exports.js';
import { getMe } from '../../blackboard/api/courses.js';
import { exportAttendance, exportBrief, exportMultiAgenda, exportMultiGrades, exportOutline, exportReceipts } from '../../blackboard/services/student-exports.js';
import type { Session } from '../../blackboard/types.js';
import { type GetClient, accountId, blackboardId, course, courseIdentifier, courseIds, outlineLimits, output, range, textResult, toolRegistrar } from './context.js';
export function registerExportsTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_export_course_agenda', {
        description: 'Guarda una copia .ics de las fechas devueltas por la agenda, dentro de la raíz de descargas. No sincroniza calendarios ni expande recurrencias; rechaza fuentes fallidas salvo allowPartial=true.',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: { courseId: blackboardId('courseId'), since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }),
            outputDir: z.string().optional().describe('Subcarpeta relativa; exports por defecto'), allowPartial: z.boolean().optional() },
    }, async ({ courseId, since, until, ...options }) => {
        validateCalendarRange(since, until);
        const { client } = await getClient();
        return textResult(await exportCourseAgenda(client, courseId, since, until, options));
    });
    server.registerTool('blackboard_export_course_grades', {
        description: 'Guarda notas publicadas de la cuenta autenticada como CSV local. Conserva ceros, celdas ausentes y campos de escala separados; no calcula promedio final.',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: { courseId: blackboardId('courseId'), outputDir: z.string().optional().describe('Subcarpeta relativa; exports por defecto'), allowPartial: z.boolean().optional() },
    }, async ({ courseId, ...options }) => {
        const { client, session } = await getClient();
        const userId = session.userId ?? (await getMe(client)).id;
        return textResult(await exportCourseGrades(client, courseId, userId, options));
    });
    register('export_multi_course_agenda', 'Guarda una copia ICS de fechas de 1 a 10 cursos en descargas/exports, con identificadores por sección. No sincroniza calendarios; parcial solo con allowPartial.', { courseIds, ...range, ...output }, async ({ courseIds, since, until, ...options }) => { validateCalendarRange(since, until); return exportMultiAgenda((await getClient()).client, courseIds, since, until, options); }, true);
    register('export_attendance', 'Guarda CSV privado de tu asistencia filtrada por sesiones del curso; registros ausentes quedan vacíos. No exporta otras cuentas.', { ...course, ...output }, async ({ courseId, ...options }) => {
        const { client } = await getClient(), user = await getMe(client);
        const userId = await accountId(client, { userId: user.id } as Session);
        return exportAttendance(client, courseId, { id: userId, ...(typeof user.externalId === 'string' ? { externalId: user.externalId } : {}) }, options);
    }, true);
    register('export_course_outline', 'Guarda JSON privado con estructura y fuentes de un curso; evita exportar consultas incompletas sin allowPartial.', { ...course, ...outlineLimits, ...output }, async ({ courseId, ...options }) => exportOutline((await getClient()).client, courseId, options), true);
    register('export_study_brief', 'Guarda un resumen Markdown privado de fechas y posibles sílabos. No descarga el documento ni garantiza que sea el sílabo vigente.', { ...course, ...range, ...output }, async ({ courseId, since, until, ...options }) => { validateCalendarRange(since, until); return exportBrief((await getClient()).client, courseId, since, until, options); }, true);
    register('export_submission_receipts', 'Guarda CSV privado con los comprobantes existentes de tus intentos de una actividad, incluyendo ausencia de comprobante.', { ...course, columnId: courseIdentifier, ...output }, async ({ courseId, columnId, ...options }) => { const { client, session } = await getClient(); return exportReceipts(client, courseId, columnId, await accountId(client, session), options); }, true);
    register('export_multi_course_grades', 'Guarda CSV privado de tus notas de los cursos elegidos. Conserva notas ausentes y ceros; no calcula promedios o escalas.', { courseIds, ...output }, async ({ courseIds, ...options }) => { const { client, session } = await getClient(); return exportMultiGrades(client, courseIds, await accountId(client, session), options); }, true);
}
