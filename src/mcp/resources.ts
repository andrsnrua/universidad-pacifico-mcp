import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { INSTITUTION_GUIDE } from './institution.js';
export function registerResources(server: McpServer): void {
    server.registerResource('guia-up', 'upacifico://guide', {
        title: 'Guía de Aula Virtual UP', description: 'Alcance, flujo académico y privacidad del MCP.', mimeType: 'text/markdown',
    }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: INSTITUTION_GUIDE }] }));
}
