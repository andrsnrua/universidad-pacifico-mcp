import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { login } from '../../blackboard/auth/login.js';
import { clearReloginCooldown, clearSession } from '../../blackboard/auth/session.js';
import { getMe } from '../../blackboard/api/courses.js';
import { type GetClient, READ_ONLY, textResult } from './context.js';
export function registerSessionTools(server: McpServer, getClient: GetClient): void {
    server.registerTool('blackboard_login', {
        description: 'Abre una ventana local para iniciar sesión en Aula Virtual UP. La contraseña no se recibe ni se almacena.',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async () => {
        const session = await login({ headless: false, timeout: 5 * 60000 });
        return textResult({ authenticated: true, userId: session.userId, userName: session.userName });
    });
    server.registerTool('blackboard_logout', {
        description: 'Elimina la sesión y el perfil privados de este MCP. No elimina materiales descargados.',
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async () => {
        clearSession();
        clearReloginCooldown();
        return textResult({ authenticated: false, localSessionCleared: true });
    });
    server.registerTool('blackboard_whoami', { annotations: READ_ONLY, description: 'Usuario autenticado en Aula Virtual UP' }, async () => {
        const { client } = await getClient();
        return textResult(await getMe(client));
    });
}
