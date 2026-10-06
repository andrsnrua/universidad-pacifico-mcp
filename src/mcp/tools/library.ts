import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { inspectManifest, listMaterials, readMaterial, searchMaterials } from '../../library/materials.js';
import { maxResults, pages, query, relative, toolRegistrar } from './context.js';
export function registerLibraryTools(server: McpServer): void {
    const register = toolRegistrar(server);
    register('list_downloaded_materials', 'Inventario local de descargas UP con rutas relativas, tamaños y formatos legibles. No requiere sesión ni descarga archivos nuevos.', { subdirectory: relative.optional(), maxFiles: z.number().int().min(1).max(1000).optional(), maxDepth: z.number().int().min(0).max(30).optional() }, listMaterials);
    register('read_downloaded_material', 'Lee texto local de PDF, DOCX, PPTX, XLSX y texto UTF-8 dentro de las descargas. Hasta 20 MiB, 20 páginas PDF y 20000 caracteres por respuesta; no ejecuta documentos ni hace OCR.', { path: relative.min(1), offset: z.number().int().min(0).max(200000).optional(), maxChars: z.number().int().min(1).max(20000).optional(), ...pages }, ({ path, ...options }) => readMaterial(path, options));
    register('search_downloaded_materials', 'Busca términos en el texto de materiales ya descargados, con límites y avisos de cobertura. No consulta archivos externos ni hace OCR.', { query, subdirectory: relative.optional(), maxFiles: z.number().int().min(1).max(25).optional(), maxResults, maxPages: pages.maxPages }, ({ query, ...options }) => searchMaterials(query, options));
    register('inspect_course_manifest', 'Comprueba existencia y tamaño de descargas referenciadas por un manifest.json local. Rechaza rutas externas; no verifica hashes ni contenido remoto.', { path: relative.min(1) }, args => inspectManifest(args.path));
}
