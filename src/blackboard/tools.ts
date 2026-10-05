import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { login } from './auth/login.js';
import { clearSession, clearReloginCooldown, isSessionValid, loadOrRefreshSession } from './auth/session.js';
import { assertBlackboardFileUrl, assertPublicApiUrl, createClient } from './api/client.js';
import { getContent, getCalendarItems, getGradeColumns, getGradebookCategories, getCourse, getCourseAnnouncements, getGrades, getMe, getSystemVersion } from './api/courses.js';
import { getAttempt, getAttemptFiles, listAssignments, listAttempts } from './api/assignments.js';
import { allContents, downloadStream, downloadWholeCourse } from '../downloads/course-materials.js';
import { readAllPages } from './api/pagination.js';
import { assignmentDetails, assignmentFeedback, contentAttachments, courseAgenda, courseOverview, findSyllabus, listCourseFiles, listCourseLinks, searchAnnouncements, searchContents, validateCalendarRange } from './services/course-workflows.js';
import { exportCourseAgenda, exportCourseGrades } from './services/exports.js';
import { resolveDownloadDir } from '../security/files.js';
import { registerParticipationTools } from './participation-tools.js';
import { registerStudentTools } from './student-tools.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

const blackboardId = (label: string) => z.string().regex(/^_\d+_\d+$/, `${label} debe tener la forma _12345_1`);
const searchLimits = {
  maxItems: z.number().int().min(1).max(1000).optional().describe('Contenidos a examinar; 300 por defecto'),
  maxDepth: z.number().int().min(0).max(30).optional().describe('Profundidad máxima; 20 por defecto'),
  maxResults: z.number().int().min(1).max(100).optional().describe('Coincidencias devueltas; 50 por defecto'),
};

async function getClient() {
  const session = await loadOrRefreshSession();
  if (!isSessionValid(session)) {
    throw new Error('No hay una sesión activa. Ejecuta blackboard_login.');
  }
  return { client: createClient(session!), session: session! };
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function registerBlackboardTools(server: McpServer) {
  registerParticipationTools(server, getClient);
  registerStudentTools(server, getClient);
  server.registerTool(
    'blackboard_login',
    {
      description: 'Abre una ventana local para iniciar sesión en Aula Virtual UP. La contraseña no se recibe ni se almacena.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async () => {
      const session = await login({ headless: false, timeout: 5 * 60_000 });
      return textResult({ authenticated: true, userId: session.userId, userName: session.userName });
    },
  );

  server.registerTool('blackboard_whoami', { annotations: READ_ONLY, description: 'Usuario autenticado en Aula Virtual UP' }, async () => {
    const { client } = await getClient();
    return textResult(await getMe(client));
  });

  server.registerTool('blackboard_system_version', { annotations: READ_ONLY, description: 'Versión del servidor Blackboard Learn de UP' }, async () => {
    const { client } = await getClient();
    return textResult(await getSystemVersion(client));
  });

  server.registerTool('blackboard_list_courses', { annotations: READ_ONLY, description: 'Cursos asociados a la cuenta autenticada, respetando los permisos de Blackboard' }, async () => {
    const { client, session } = await getClient();
    const userId = session.userId ?? (await getMe(client)).id;
    return textResult(await readAllPages(client, `/learn/api/public/v1/users/${userId}/courses`, { expand: 'course' }));
  });

  server.registerTool(
    'blackboard_get_course',
    { annotations: READ_ONLY, description: 'Detalle de un curso', inputSchema: { courseId: blackboardId('courseId') } },
    async ({ courseId }) => {
      const { client } = await getClient();
      return textResult(await getCourse(client, courseId));
    },
  );

  server.registerTool(
    'blackboard_list_contents',
    {
      description: 'Materiales de un curso o carpeta',
      annotations: READ_ONLY,
      inputSchema: { courseId: blackboardId('courseId'), parentId: blackboardId('parentId').optional() },
    },
    async ({ courseId, parentId }) => {
      const { client } = await getClient();
      return textResult({ results: await allContents(client, courseId, parentId) });
    },
  );

  server.registerTool(
    'blackboard_list_announcements',
    { annotations: READ_ONLY, description: 'Anuncios del curso', inputSchema: { courseId: blackboardId('courseId') } },
    async ({ courseId }) => {
      const { client } = await getClient();
      return textResult(await getCourseAnnouncements(client, courseId));
    },
  );

  server.registerTool(
    'blackboard_list_assignments',
    { annotations: READ_ONLY, description: 'Actividades evaluables Attempts/Manual con fechas y puntajes publicados; no determina si falta entregar', inputSchema: { courseId: blackboardId('courseId') } },
    async ({ courseId }) => {
      const { client } = await getClient();
      return textResult(await listAssignments(client, courseId));
    },
  );

  server.registerTool(
    'blackboard_list_attempts',
    {
      description: 'Intentos de una tarea',
      annotations: READ_ONLY,
      inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId') },
    },
    async ({ courseId, columnId }) => {
      const { client } = await getClient();
      return textResult(await listAttempts(client, courseId, columnId));
    },
  );

  server.registerTool(
    'blackboard_get_grades',
    { annotations: READ_ONLY, description: 'Calificaciones del estudiante en un curso', inputSchema: { courseId: blackboardId('courseId') } },
    async ({ courseId }) => {
      const { client, session } = await getClient();
      const userId = session.userId ?? (await getMe(client)).id;
      return textResult(await getGrades(client, courseId, userId));
    },
  );

  server.registerTool(
    'blackboard_list_attachments',
    {
      description: 'Adjuntos REST y archivos incrustados de un contenido',
      annotations: READ_ONLY,
      inputSchema: { courseId: blackboardId('courseId'), contentId: blackboardId('contentId') },
    },
    async ({ courseId, contentId }) => {
      const { client } = await getClient();
      return textResult(await contentAttachments(client, courseId, contentId));
    },
  );

  server.registerTool(
    'blackboard_download_attachment',
    {
      description: 'Descarga un adjunto concreto dentro de la carpeta protegida de descargas',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: {
        courseId: blackboardId('courseId'),
        contentId: blackboardId('contentId'),
        attachmentId: blackboardId('attachmentId'),
        filename: z.string(),
        outputDir: z.string().optional(),
      },
    },
    async ({ courseId, contentId, attachmentId, filename, outputDir }) => {
      const { client } = await getClient();
      const directory = resolveDownloadDir(outputDir);
      return textResult(await downloadStream(
        client,
        `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachmentId}/download`,
        directory,
        filename,
      ));
    },
  );

  server.registerTool(
    'blackboard_download_file_url',
    {
      description: 'Descarga una URL bbcswebdav de Blackboard UP',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: { url: z.string(), filename: z.string(), outputDir: z.string().optional() },
    },
    async ({ url, filename, outputDir }) => {
      assertBlackboardFileUrl(url);
      const { client } = await getClient();
      return textResult(await downloadStream(client, url, resolveDownloadDir(outputDir), filename));
    },
  );

  server.registerTool(
    'blackboard_download_course_materials',
    {
      description: 'Recorre contenidos y actividades accesibles, descarga materiales y crea manifest.json con omisiones y fallos. No hace entregas.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: {
        courseId: blackboardId('courseId'),
        outputDir: z.string().optional().describe('Subcarpeta relativa dentro de la raíz configurada'),
      },
    },
    async ({ courseId, outputDir }) => {
      const { client } = await getClient();
      return textResult(await downloadWholeCourse(client, courseId, outputDir));
    },
  );

  server.registerTool(
    'blackboard_get_assignment_feedback',
    {
      description: 'Último intento accesible por actividad, nota y comentarios. includeAttemptFiles=true consulta además archivos asociados, que pueden tener permisos diferentes y no son necesariamente retroalimentación del docente.',
      annotations: READ_ONLY,
      inputSchema: { courseId: blackboardId('courseId'), includeAttemptFiles: z.boolean().optional() },
    },
    async ({ courseId, includeAttemptFiles }) => {
      const { client } = await getClient();
      return textResult(await assignmentFeedback(client, courseId, includeAttemptFiles));
    },
  );

  server.registerTool(
    'blackboard_raw_get',
    {
      description: 'GET de solo lectura a un endpoint público de Blackboard no cubierto por otra herramienta',
      annotations: READ_ONLY,
      inputSchema: { path: z.string(), query: z.string().optional() },
    },
    async ({ path: apiPath, query }) => {
      assertPublicApiUrl(apiPath);
      const { client } = await getClient();
      const params = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
      return textResult((await client.get(apiPath, { params })).data);
    },
  );
  server.registerTool('blackboard_logout', {
    description: 'Elimina la sesión y el perfil privados de este MCP. No elimina materiales descargados.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => {
    clearSession();
    clearReloginCooldown();
    return textResult({ authenticated: false, localSessionCleared: true });
  });

  server.registerTool('blackboard_get_content', {
    description: 'Detalle y enunciado de un contenido, actividad o documento de una sección.',
    annotations: READ_ONLY,
    inputSchema: { courseId: blackboardId('courseId'), contentId: blackboardId('contentId') },
  }, async ({ courseId, contentId }) => {
    const { client } = await getClient();
    return textResult(await getContent(client, courseId, contentId));
  });

  server.registerTool('blackboard_get_grade_columns', {
    description: 'Columnas de calificaciones y puntajes máximos. No contiene necesariamente las ponderaciones del sílabo.',
    annotations: READ_ONLY,
    inputSchema: { courseId: blackboardId('courseId') },
  }, async ({ courseId }) => {
    const { client } = await getClient();
    return textResult(await getGradeColumns(client, courseId));
  });

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

  server.registerTool('blackboard_get_course_overview', {
    description: 'Reúne detalle del curso, anuncios, contenidos raíz, actividades y notas; señala fuentes no accesibles.',
    annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
  }, async ({ courseId }) => {
    const { client, session } = await getClient();
    const userId = session.userId ?? (await getMe(client)).id;
    return textResult(await courseOverview(client, courseId, userId));
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

  server.registerTool('blackboard_get_assignment_details', {
    description: 'Reúne metadatos de una actividad, instrucciones de su contenido, adjuntos e intentos accesibles; informa consultas incompletas.',
    annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId') },
  }, async ({ courseId, columnId }) => {
    const { client } = await getClient();
    return textResult(await assignmentDetails(client, courseId, columnId));
  });

  server.registerTool('blackboard_get_attempt', {
    description: 'Consulta un intento ya existente mediante sus IDs; respeta los permisos de la cuenta.',
    annotations: READ_ONLY,
    inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId'), attemptId: blackboardId('attemptId') },
  }, async ({ courseId, columnId, attemptId }) => {
    const { client } = await getClient();
    return textResult(await getAttempt(client, courseId, columnId, attemptId));
  });

  server.registerTool('blackboard_list_attempt_files', {
    description: 'Lista archivos asociados a un intento; no los identifica automáticamente como correcciones del docente.',
    annotations: READ_ONLY,
    inputSchema: { courseId: blackboardId('courseId'), columnId: blackboardId('columnId'), attemptId: blackboardId('attemptId') },
  }, async ({ courseId, columnId, attemptId }) => {
    const { client } = await getClient();
    return textResult(await getAttemptFiles(client, courseId, columnId, attemptId));
  });

  server.registerTool('blackboard_get_grade_categories', {
    description: 'Categorías publicadas del libro de notas (id y título); no proporciona porcentajes ni calcula la nota final.',
    annotations: READ_ONLY, inputSchema: { courseId: blackboardId('courseId') },
  }, async ({ courseId }) => {
    const { client } = await getClient();
    return textResult(await getGradebookCategories(client, courseId));
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

  server.registerTool('blackboard_search_announcements', {
    description: 'Busca todos los términos en títulos y texto de anuncios accesibles del curso, ignorando tildes y mayúsculas.',
    annotations: READ_ONLY,
    inputSchema: { courseId: blackboardId('courseId'), query: z.string().trim().min(1).max(200), maxResults: z.number().int().min(1).max(100).optional() },
  }, async ({ courseId, query, maxResults }) => {
    const { client } = await getClient();
    return textResult(await searchAnnouncements(client, courseId, query, maxResults));
  });

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
}
