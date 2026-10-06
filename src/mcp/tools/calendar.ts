import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { courseAgenda, validateCalendarRange } from '../../blackboard/services/course-workflows.js';
import { getCalendarItems } from '../../blackboard/api/courses.js';
import { multiCourseAgenda } from '../../blackboard/services/participation.js';
import { calendarEvent, calendarTypes, visibleCalendars } from '../../blackboard/api/student.js';
import { type GetClient, READ_ONLY, blackboardId, textResult, toolRegistrar } from './context.js';
export function registerCalendarTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_list_calendar', {
        description: 'Eventos publicados en el calendario de Blackboard entre dos fechas ISO 8601; no representa el horario académico completo.',
        annotations: READ_ONLY,
        inputSchema: {
            courseId: blackboardId('courseId').optional(),
            since: z.string().datetime({ offset: true }),
            until: z.string().datetime({ offset: true }),
        },
    }, async ({ courseId, since, until }) => {
        validateCalendarRange(since, until);
        const { client } = await getClient();
        return textResult(await getCalendarItems(client, since, until, courseId));
    });
    server.registerTool('blackboard_get_course_agenda', {
        description: 'Combina vencimientos publicados de actividades con eventos de calendario en un intervalo de hasta 112 días. No determina tareas pendientes de entrega.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) },
    }, async ({ courseId, since, until }) => {
        validateCalendarRange(since, until);
        const { client } = await getClient();
        return textResult(await courseAgenda(client, courseId, since, until));
    });
    server.registerTool('blackboard_get_multi_course_agenda', {
        description: 'Agenda combinada y ordenada de 1 a 10 cursos elegidos por ID, con fechas publicadas y avisos por curso. Máximo 112 días; no determina entregas pendientes ni mezcla secciones por nombre.',
        annotations: READ_ONLY, inputSchema: { courseIds: z.array(blackboardId('courseId')).min(1).max(10), since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) },
    }, async ({ courseIds, since, until }) => {
        validateCalendarRange(since, until);
        const { client } = await getClient();
        return textResult(await multiCourseAgenda(client, courseIds, since, until));
    });
    register('list_calendars', 'Calendarios visibles para la cuenta actual. Consulta eventos con list_calendar; no equivale al horario académico completo.', {}, async () => visibleCalendars((await getClient()).client));
    register('get_calendar_event', 'Detalle de un evento accesible por tipo e ID devueltos por list_calendar; no modifica citas.', { type: z.enum(calendarTypes), eventId: z.string().regex(/^[_A-Za-z0-9-]{1,160}$/) }, async (args) => calendarEvent((await getClient()).client, args.type, args.eventId));
}
