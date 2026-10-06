import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import type { Session } from '../../blackboard/types.js';
import { createClient } from '../../blackboard/api/client.js';
import { getMe } from '../../blackboard/api/courses.js';
import { isSessionValid, loadOrRefreshSession } from '../../blackboard/auth/session.js';
export type GetClient = () => Promise<{
    client: AxiosInstance;
    session: Session;
}>;
export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
export const WRITE_LOCAL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
export const blackboardId = (label: string) => z.string().regex(/^_\d+_\d+$/, `${label} debe tener la forma _12345_1`);
export const searchLimits = {
    maxItems: z.number().int().min(1).max(1000).optional().describe('Contenidos a examinar; 300 por defecto'),
    maxDepth: z.number().int().min(0).max(30).optional().describe('Profundidad máxima; 20 por defecto'),
    maxResults: z.number().int().min(1).max(100).optional().describe('Coincidencias devueltas; 50 por defecto'),
};
export const courseIdentifier = z.string().regex(/^_\d+_\d+$/, 'Usa un ID Blackboard como _12345_1.');
export const courseIds = z.array(courseIdentifier).min(1).max(10);
export const course = { courseId: courseIdentifier };
export const outlineLimits = { maxItems: z.number().int().min(1).max(1000).optional(), maxDepth: z.number().int().min(0).max(30).optional() };
export const maxResults = z.number().int().min(1).max(100).optional();
export const query = z.string().trim().min(1).max(300);
export const relative = z.string().max(1000).refine(value => !/^(?:[\\/]|[a-z]:)/i.test(value) && !value.includes(':') && !value.split(/[\\/]/).some(part => part === '..' || part.startsWith('.')), 'Usa una ruta relativa segura dentro de las descargas.');
export const range = { since: z.string().datetime({ offset: true }), until: z.string().datetime({ offset: true }) };
export const output = { outputDir: relative.optional(), allowPartial: z.boolean().optional() };
export const pages = { startPage: z.number().int().min(1).max(10000).optional(), maxPages: z.number().int().min(1).max(20).optional() };
export const messageFilters = { groupId: blackboardId('groupId').optional(), onlyMine: z.boolean().optional(), status: z.enum(['Published', 'Deleted', 'Draft']).optional() };
export async function getAuthenticatedClient() {
    const session = await loadOrRefreshSession();
    if (!isSessionValid(session))
        throw new Error('No hay una sesión activa. Ejecuta blackboard_login.');
    return { client: createClient(session!), session: session! };
}
export async function accountId(client: AxiosInstance, session: Session): Promise<string> {
    const userId = session.userId ?? (await getMe(client)).id;
    if (typeof userId !== 'string' || !/^_\d+_\d+$/.test(userId))
        throw new Error('No se pudo identificar la cuenta autenticada.');
    return userId;
}
export function textResult(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
export function toolRegistrar(server: McpServer) {
    return function register<Shape extends z.ZodRawShape>(name: string, description: string, inputSchema: Shape, handler: (args: z.output<z.ZodObject<Shape>>) => unknown | Promise<unknown>, localWrite = false): void {
        server.registerTool(`blackboard_${name}`, { description, inputSchema: inputSchema as z.ZodRawShape, annotations: localWrite ? WRITE_LOCAL : READ_ONLY }, async (args) => textResult(await handler(args as z.output<z.ZodObject<Shape>>)));
    };
}
