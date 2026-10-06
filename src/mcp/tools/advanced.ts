import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSystemVersion } from '../../blackboard/api/courses.js';
import { z } from 'zod';
import { assertPublicApiUrl } from '../../blackboard/api/client.js';
import { type GetClient, READ_ONLY, textResult } from './context.js';
export function registerAdvancedTools(server: McpServer, getClient: GetClient): void {
    server.registerTool('blackboard_system_version', { annotations: READ_ONLY, description: 'Versión del servidor Blackboard Learn de UP' }, async () => {
        const { client } = await getClient();
        return textResult(await getSystemVersion(client));
    });
    server.registerTool('blackboard_raw_get', {
        description: 'GET de solo lectura a un endpoint público de Blackboard no cubierto por otra herramienta',
        annotations: READ_ONLY,
        inputSchema: { path: z.string(), query: z.string().optional() },
    }, async ({ path: apiPath, query }) => {
        assertPublicApiUrl(apiPath);
        const { client } = await getClient();
        const params = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
        return textResult((await client.get(apiPath, { params })).data);
    });
}
