import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allContents } from '../../downloads/course-materials.js';
import { getContent } from '../../blackboard/api/courses.js';
import { contentAttachments, findSyllabus, listCourseFiles, listCourseLinks, searchContents } from '../../blackboard/services/course-workflows.js';
import { z } from 'zod';
import { courseOutline, multiContentSearch, reviewSummary } from '../../blackboard/services/student.js';
import { contentReviewStatus } from '../../blackboard/services/participation.js';
import { type GetClient, READ_ONLY, accountId, blackboardId, course, courseIds, maxResults, outlineLimits, query, searchLimits, textResult, toolRegistrar } from './context.js';
export function registerContentsTools(server: McpServer, getClient: GetClient): void {
    const register = toolRegistrar(server);
    server.registerTool('blackboard_list_contents', {
        description: 'Materiales de un curso o carpeta',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), parentId: blackboardId('parentId').optional() },
    }, async ({ courseId, parentId }) => {
        const { client } = await getClient();
        return textResult({ results: await allContents(client, courseId, parentId) });
    });
    server.registerTool('blackboard_get_content', {
        description: 'Detalle y enunciado de un contenido, actividad o documento de una sección.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), contentId: blackboardId('contentId') },
    }, async ({ courseId, contentId }) => {
        const { client } = await getClient();
        return textResult(await getContent(client, courseId, contentId));
    });
    server.registerTool('blackboard_list_attachments', {
        description: 'Adjuntos REST y archivos incrustados de un contenido',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), contentId: blackboardId('contentId') },
    }, async ({ courseId, contentId }) => {
        const { client } = await getClient();
        return textResult(await contentAttachments(client, courseId, contentId));
    });
    server.registerTool('blackboard_search_contents', {
        description: 'Busca términos en títulos, texto publicado y nombres de archivos de un árbol de curso. No lee el interior de PDF, Word ni otros adjuntos.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), query: z.string().trim().min(1).max(200),
            includeAttachments: z.boolean().optional().describe('Consultar nombres de adjuntos REST; false por defecto'), ...searchLimits },
    }, async ({ courseId, query, ...options }) => {
        const { client } = await getClient();
        return textResult(await searchContents(client, courseId, query, options));
    });
    server.registerTool('blackboard_find_syllabus', {
        description: 'Localiza posibles sílabos por título, texto o nombre de archivo; incluye adjuntos REST. Devuelve candidatos con IDs para verificar la sección.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), ...searchLimits },
    }, async ({ courseId, ...options }) => {
        const { client } = await getClient();
        return textResult(await findSyllabus(client, courseId, options));
    });
    server.registerTool('blackboard_list_course_files', {
        description: 'Inventario recursivo de adjuntos REST y archivos bbcswebdav incrustados, con rutas e IDs. Puede filtrar por extensión del nombre; no descarga ni lee archivos.',
        annotations: READ_ONLY,
        inputSchema: { courseId: blackboardId('courseId'), ...searchLimits,
            extensions: z.array(z.string().regex(/^[a-zA-Z0-9]{1,12}$/)).max(20).optional().describe('Extensiones sin punto, por ejemplo pdf, pptx o docx; vacío devuelve todos los nombres') },
    }, async ({ courseId, ...options }) => {
        const { client } = await getClient();
        return textResult(await listCourseFiles(client, courseId, options));
    });
    server.registerTool('blackboard_list_course_links', {
        description: 'Enlaces HTTP/HTTPS publicados en páginas o contentHandler.url del curso, con ruta y origen interno/externo. No abre ni autentica servicios externos.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), ...searchLimits },
    }, async ({ courseId, ...options }) => {
        const { client } = await getClient();
        return textResult(await listCourseLinks(client, courseId, options));
    });
    register('get_course_outline', 'Estructura recursiva acotada de carpetas y contenidos, con rutas, tipos y avisos de truncamiento.', { ...course, ...outlineLimits }, async ({ courseId, ...options }) => courseOutline((await getClient()).client, courseId, options));
    register('search_multi_course_contents', 'Busca títulos, texto publicado y nombres de archivos en 1 a 10 secciones elegidas. Presupuesto global de recorrido; no lee el cuerpo de archivos remotos.', { courseIds, query, ...outlineLimits, maxResults, includeAttachments: z.boolean().optional() }, async ({ courseIds, query, ...options }) => multiContentSearch((await getClient()).client, courseIds, query, options));
    server.registerTool('blackboard_get_content_review_status', {
        description: 'Lee el estado de revisión propio de un contenido configurado como revisable. No lo marca como revisado; un contenido no revisable no se interpreta como pendiente.',
        annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), contentId: blackboardId('contentId') },
    }, async ({ courseId, contentId }) => {
        const { client, session } = await getClient();
        return textResult(await contentReviewStatus(client, courseId, contentId, await accountId(client, session)));
    });
    register('get_course_review_summary', 'Estados propios de los contenidos configurados como revisables en un recorrido acotado. No marca revisiones ni calcula progreso académico.', { ...course, ...outlineLimits }, async ({ courseId, ...options }) => { const { client, session } = await getClient(); return reviewSummary(client, courseId, await accountId(client, session), options); });
}
