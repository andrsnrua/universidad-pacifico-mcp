import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveDownloadDir } from '../../security/files.js';
import { downloadStream, downloadWholeCourse } from '../../downloads/course-materials.js';
import { assertBlackboardFileUrl } from '../../blackboard/api/client.js';
import { type GetClient, blackboardId, textResult } from './context.js';
export function registerDownloadsTools(server: McpServer, getClient: GetClient): void {
    server.registerTool('blackboard_download_attachment', {
        description: 'Descarga un adjunto concreto dentro de la carpeta protegida de descargas',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: {
            courseId: blackboardId('courseId'),
            contentId: blackboardId('contentId'),
            attachmentId: blackboardId('attachmentId'),
            filename: z.string(),
            outputDir: z.string().optional(),
        },
    }, async ({ courseId, contentId, attachmentId, filename, outputDir }) => {
        const { client } = await getClient();
        const directory = resolveDownloadDir(outputDir);
        return textResult(await downloadStream(client, `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachmentId}/download`, directory, filename));
    });
    server.registerTool('blackboard_download_file_url', {
        description: 'Descarga una URL bbcswebdav de Blackboard UP',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: { url: z.string(), filename: z.string(), outputDir: z.string().optional() },
    }, async ({ url, filename, outputDir }) => {
        assertBlackboardFileUrl(url);
        const { client } = await getClient();
        return textResult(await downloadStream(client, url, resolveDownloadDir(outputDir), filename));
    });
    server.registerTool('blackboard_download_course_materials', {
        description: 'Recorre contenidos y actividades accesibles, descarga materiales y crea manifest.json con omisiones y fallos. No hace entregas.',
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        inputSchema: {
            courseId: blackboardId('courseId'),
            outputDir: z.string().optional().describe('Subcarpeta relativa dentro de la raíz configurada'),
        },
    }, async ({ courseId, outputDir }) => {
        const { client } = await getClient();
        return textResult(await downloadWholeCourse(client, courseId, outputDir));
    });
}
