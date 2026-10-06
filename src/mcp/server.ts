import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { INSTITUTION_GUIDE } from './institution.js';
const { version } = require('../../package.json') as {
    version: string;
};
export function createMcpServer(): McpServer {
    const server = new McpServer({ name: 'universidad-pacifico-mcp', version }, { instructions: INSTITUTION_GUIDE });
    registerTools(server);
    registerResources(server);
    registerPrompts(server);
    return server;
}
export async function startMcpServer(): Promise<void> {
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
    const close = () => { void server.close().finally(() => process.exit(0)); };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
}
