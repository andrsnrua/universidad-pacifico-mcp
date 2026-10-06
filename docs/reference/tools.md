# Referencia de herramientas

[Índice de documentación](../README.md)

Los IDs internos de Blackboard tienen forma `_12345_1`. Obtén los valores reales con las consultas anteriores; los ejemplos son ficticios. Las consultas respetan los permisos remotos. Los errores MCP tienen `isError: true`.

## Sesión

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_login` | Ninguno | Navegador interactivo y confirmación de usuario. |
| `blackboard_logout` | Ninguno | Elimina sesión y perfil locales del MCP. |
| `blackboard_whoami` | Ninguno | Usuario que confirma Blackboard. |

## Cursos

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_courses` | Ninguno | Cursos asociados a la cuenta; conserva información remota. |
| `blackboard_get_course` | `courseId` | Detalle, disponibilidad y periodo si existe. |
| `blackboard_get_course_overview` | `courseId` | Curso, anuncios, contenidos raíz, actividades y notas; advierte fuentes restringidas. |
| `blackboard_get_multi_course_overview` | `courseIds` | Resumen detallado de hasta cinco secciones. |
| `blackboard_get_my_enrollment` | `courseId` | Inscripción y rol de la cuenta actual en el curso de Blackboard. |
| `blackboard_get_study_brief` | `courseId`, `since`, `until` | Fechas y candidatos a sílabo, con fuentes y texto Markdown. |

## Contenidos y sílabos

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_contents` | `courseId`, `parentId?` | Contenidos de la raíz o una carpeta, paginados. |
| `blackboard_get_content` | `courseId`, `contentId` | Documento, descripción o instrucciones según el tipo. |
| `blackboard_list_attachments` | `courseId`, `contentId` | Adjuntos REST y vínculos de archivos incrustados. |
| `blackboard_search_contents` | `courseId`, `query`, `includeAttachments?`, `maxItems?`, `maxDepth?`, `maxResults?` | Coincidencias en títulos, texto publicado y nombres de archivos; conserva rutas e IDs. |
| `blackboard_find_syllabus` | `courseId`, `maxItems?`, `maxDepth?`, `maxResults?` | Candidatos a sílabo por nombre o texto; incluye adjuntos REST. |
| `blackboard_list_course_files` | `courseId`, `extensions?`, `maxItems?`, `maxDepth?`, `maxResults?` | Inventario de adjuntos REST y archivos incrustados, con rutas; filtra por extensión del nombre. |
| `blackboard_list_course_links` | `courseId`, `maxItems?`, `maxDepth?`, `maxResults?` | Enlaces HTTP/HTTPS publicados en contenido y texto; distingue origen interno/externo. |
| `blackboard_get_course_outline` | `courseId`, `maxItems?`, `maxDepth?` | Estructura recursiva con rutas y tipos. |
| `blackboard_search_multi_course_contents` | `courseIds`, `query`, `maxItems?`, `maxDepth?`, `maxResults?`, `includeAttachments?` | Búsqueda entre hasta diez cursos; presupuesto global y avisos por sección. |
| `blackboard_get_content_review_status` | `courseId`, `contentId` | Estado de revisión propio; `null` para contenidos no revisables. |
| `blackboard_get_course_review_summary` | `courseId`, `maxItems?`, `maxDepth?` | Estados propios de contenidos revisables; no mide progreso académico. |

## Anuncios

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_announcements` | `courseId` | Anuncios publicados y accesibles. |
| `blackboard_search_announcements` | `courseId`, `query`, `maxResults?` | Coincidencias en títulos y texto de anuncios; muestra total y truncamiento. |
| `blackboard_list_institution_announcements` | `title?`, `includeExpired?` | Avisos institucionales accesibles en Aula Virtual. |
| `blackboard_get_announcement` | `courseId`, `announcementId` | Texto y metadatos del anuncio de la sección. |
| `blackboard_search_multi_course_announcements` | `courseIds`, `query`, `maxResults?` | Coincidencias de avisos, con ID de sección. |

## Actividades y calificaciones

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_assignments` | `courseId` | Columnas Attempts/Manual: actividades, fechas y puntajes. |
| `blackboard_list_attempts` | `courseId`, `columnId` | Intentos ya existentes accesibles. |
| `blackboard_get_grades` | `courseId` | Calificaciones de la cuenta autenticada. |
| `blackboard_get_grade_columns` | `courseId` | Nombres de columnas, puntajes y metadatos. |
| `blackboard_get_assignment_feedback` | `courseId`, `includeAttemptFiles?` | Objeto con `results`: último intento por actividad y `attemptFiles`, con avisos de consultas incompletas. |
| `blackboard_get_assignment_details` | `courseId`, `columnId` | Actividad, instrucciones del contenido vinculado, adjuntos e intentos. |
| `blackboard_get_attempt` | `courseId`, `columnId`, `attemptId` | Un intento ya existente y accesible. |
| `blackboard_list_attempt_files` | `courseId`, `columnId`, `attemptId` | Archivos asociados al intento; pueden pertenecer al estudiante. |
| `blackboard_get_grade_categories` | `courseId` | ID y título de categorías; no incluye ponderaciones. |
| `blackboard_get_grade_detail` | `courseId`, `columnId`, `includeAttempts?` | Nota propia v2, columna e intentos cuando corresponden; declara fuentes fallidas. |
| `blackboard_list_grade_periods` | `courseId` | Periodos de evaluación configurados en el libro de notas. |
| `blackboard_get_submission_receipts` | `courseId`, `columnId` | Comprobantes publicados de intentos propios; ausentes como null. |
| `blackboard_get_course_gradebook` | `courseId` | Notas propias unidas con columnas y categorías por ID. |
| `blackboard_get_multi_course_gradebook` | `courseIds` | Libros de notas propios de hasta diez secciones. |

## Calendario

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_calendar` | `since`, `until`, `courseId?` | Eventos en el intervalo y, opcionalmente, el curso. |
| `blackboard_get_course_agenda` | `courseId`, `since`, `until` | Eventos y vencimientos ordenados, fuentes y actividades sin fecha válida. |
| `blackboard_get_multi_course_agenda` | `courseIds`, `since`, `until` | Agenda ordenada de entre 1 y 10 IDs, con fuentes y avisos por curso. |
| `blackboard_list_calendars` | Ninguno | Calendarios visibles para la cuenta actual. |
| `blackboard_get_calendar_event` | `type`, `eventId` | Detalle de evento; usa tipo e ID devueltos por el calendario. |

## Participación

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_discussions` | `courseId`, `title?`, `gradable?` | Discusiones accesibles del curso Ultra, paginadas. |
| `blackboard_get_discussion` | `courseId`, `discussionId` | Tema y metadatos de una discusión Ultra. |
| `blackboard_list_discussion_messages` | `courseId`, `discussionId`, `groupId?`, `onlyMine?`, `status?` | Mensajes accesibles; `Published` por defecto. |
| `blackboard_list_discussion_replies` | `courseId`, `discussionId`, `messageId`, `groupId?`, `onlyMine?`, `status?` | Respuestas al mensaje y relaciones de hilo. |
| `blackboard_list_groups` | `courseId`, `name?`, `inGroupSet?` | Grupos accesibles; `inGroupSet` es booleano, no un ID. |
| `blackboard_get_group` | `courseId`, `groupId` | Descripción, disponibilidad y configuración de un grupo. |
| `blackboard_list_group_sets` | `courseId` | Conjuntos de grupos accesibles, mediante `groups/sets`. |
| `blackboard_list_course_meetings` | `courseId` | Sesiones registradas en la herramienta de asistencia. |
| `blackboard_get_my_attendance` | `courseId` | Asistencia propia filtrada por las sesiones del curso; sin registros de otros cursos. |

## Descargas

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_download_attachment` | `courseId`, `contentId`, `attachmentId`, `filename`, `outputDir?` | Ruta y tamaño de un adjunto. |
| `blackboard_download_file_url` | `url`, `filename`, `outputDir?` | Descarga de una URL `/bbcswebdav/` de Aula Virtual UP. |
| `blackboard_download_course_materials` | `courseId`, `outputDir?` | Recorrido completo, materiales y manifiesto. |

## Biblioteca local

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_list_downloaded_materials` | `subdirectory?`, `maxFiles?`, `maxDepth?` | Inventario local de rutas, tamaños y formatos legibles. |
| `blackboard_read_downloaded_material` | `path`, `offset?`, `maxChars?`, `startPage?`, `maxPages?` | Texto de PDF/Office/UTF-8 ya descargado; ventanas y páginas, sin OCR. |
| `blackboard_search_downloaded_materials` | `query`, `subdirectory?`, `maxFiles?`, `maxResults?`, `maxPages?` | Búsqueda local acotada con cobertura explícita. |
| `blackboard_inspect_course_manifest` | `path` | Existencia y tamaño de archivos de un manifiesto local seguro. |

## Exportaciones

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_export_course_agenda` | `courseId`, `since`, `until`, `outputDir?`, `allowPartial?` | Copia `.ics` local de las fechas devueltas; no expande recurrencias ni sincroniza. |
| `blackboard_export_course_grades` | `courseId`, `outputDir?`, `allowPartial?` | CSV local de notas de la cuenta autenticada; sin cálculo de ponderaciones. |
| `blackboard_export_multi_course_agenda` | `courseIds`, `since`, `until`, `outputDir?`, `allowPartial?` | ICS privado, con eventos identificados por sección. |
| `blackboard_export_attendance` | `courseId`, `outputDir?`, `allowPartial?` | CSV privado de asistencia propia del curso. |
| `blackboard_export_course_outline` | `courseId`, `maxItems?`, `maxDepth?`, `outputDir?`, `allowPartial?` | JSON privado de estructura y avisos. |
| `blackboard_export_study_brief` | `courseId`, `since`, `until`, `outputDir?`, `allowPartial?` | Resumen Markdown privado con fuentes. |
| `blackboard_export_submission_receipts` | `courseId`, `columnId`, `outputDir?`, `allowPartial?` | CSV privado de comprobantes existentes. |
| `blackboard_export_multi_course_grades` | `courseIds`, `outputDir?`, `allowPartial?` | CSV privado de notas propias de varias secciones; sin promedios. |

## Consultas avanzadas

| Herramienta | Parámetros | Resultado principal |
| --- | --- | --- |
| `blackboard_system_version` | Ninguno | Versión reportada por el servidor. |
| `blackboard_raw_get` | `path`, `query?` | GET restringido a `/learn/api/public/` del host UP. |

## Fechas y consultas avanzadas

El calendario y la agenda exigen fechas ISO 8601 con zona horaria y un intervalo positivo de hasta **112 días (16 semanas)**. El filtro remoto se envía como `courseId`, conforme a la [documentación de calendario de Blackboard](https://docs.blackboard.com/docs/blackboard/rest-apis/hands-on/calendar-apis). Ejemplo ficticio para una semana en Lima:

```json
{
  "courseId": "_12345_1",
  "since": "2026-10-05T00:00:00-05:00",
  "until": "2026-10-12T00:00:00-05:00"
}
```

`blackboard_raw_get` no admite un método HTTP variable ni amplía permisos. Es un escape de consulta para endpoints públicos no cubiertos por otras herramientas; puede revelar información privada que tu propia cuenta tenga autorizado consultar. `query` usa el formato `limit=10&offset=0`.

## Búsqueda y resultados parciales

La búsqueda normal exige todos los términos, sin distinguir mayúsculas ni tildes. Examina títulos, texto de páginas/instrucciones y nombres de vínculos incrustados. `includeAttachments: true` consulta además nombres de adjuntos REST; no descarga ni lee su interior. La búsqueda de sílabos usa «sílabo», «syllabus» y «programa del curso» para proponer candidatos; debes verificar su contenido y sección.

Según el [catálogo oficial de Blackboard](https://developer.blackboard.com/portal/displayApi/Learn), el endpoint de adjuntos REST admite archivos, documentos y actividades clásicas. Cuando el tipo de contenido está disponible, las carpetas, enlaces y evaluaciones de otros tipos no se consultan con ese endpoint; sus archivos incrustados siguen apareciendo. Un error en un tipo compatible se conserva como aviso, incluso si devuelve HTTP 400 o 404.

Los archivos de un intento se consultan mediante `/learn/api/public/v1/courses/{courseId}/gradebook/attempts/{attemptId}/files`, después de validar el intento en su columna. Blackboard puede permitir consultar el intento y restringir sus archivos con HTTP 403; el MCP conserva esa limitación en los resultados parciales.

Por defecto se examinan hasta 300 contenidos, 20 niveles y se devuelven 50 resultados. Los máximos configurables son 1000 contenidos, 30 niveles y 100 resultados. `visited`, `limits`, `truncated`, `warnings` y `complete` explican el alcance real. Cada coincidencia conserva `courseId`, `contentId`, ruta de títulos y, si corresponde, `attachmentId` o URL.

Las consultas combinadas devuelven `complete: false` y avisos por fuente cuando falla una parte. En el detalle de actividad y el resumen de curso, `null` indica una fuente no consultable; una lista vacía indica una consulta completada sin elementos. Los avisos no incluyen headers, cookies ni la configuración interna del cliente HTTP.

La agenda incluye vencimientos con `since <= fecha < until` y eventos de calendario que intersectan el intervalo. Conserva la fecha ISO original y señala `America/Lima` para su presentación. No decide si una tarea falta entregar; los vencimientos llevan `completionStatus: "unknown"`. Un mismo vencimiento puede aparecer en ambas fuentes. Las actividades sin fecha válida se muestran aparte.

Los inventarios usan los mismos límites de recorrido de la búsqueda. `extensions` acepta hasta 20 extensiones alfanuméricas sin punto, por ejemplo `["pdf", "pptx"]`; se determina la extensión por el nombre, no analizando el archivo. El inventario de enlaces incluye vínculos HTTP/HTTPS del texto y `contentHandler.url`, omite credenciales incrustadas y los archivos bbcswebdav del host UP; no sigue ninguno de esos vínculos.

La búsqueda de anuncios requiere todos los términos, ignora mayúsculas/tildes y devuelve hasta 50 coincidencias por defecto (máximo 100), con `matched`, `searched`, `truncated` y `complete`. Un error al leer anuncios se devuelve como error MCP, no como cero coincidencias.

Las exportaciones escriben copias con nombres únicos en `exports/` dentro de la raíz configurada, o en `outputDir` relativo. De forma predeterminada rechazan fuentes fallidas; `allowPartial: true` permite exportar datos accesibles con avisos. No exportan notas si falla la consulta de notas, aunque se permita un resultado parcial. Detalles del formato y la privacidad en [exports.md](exports.md).

`blackboard_get_assignment_feedback` devuelve `{courseId, results, complete}` y usa `attemptFiles` en lugar de `feedbackFiles`, porque los archivos no necesariamente son correcciones del docente.

Los archivos de retroalimentación se consultan solo con `includeAttemptFiles: true`; por defecto se consultan intentos y comentarios. `attemptFilesRequested` distingue una fuente omitida de una consulta fallida. Las consultas entre cursos y la cobertura del lector local se explican en [usage.md](../guide/usage.md).

Las consultas de participación se detallan en [participation.md](participation.md). Las consultas propias no aceptan un `userId` elegido por el cliente. El campo `grade.status` se conserva como dato histórico y se señala como no fiable.

## Anotaciones MCP

Las consultas se marcan `readOnlyHint: true`. Login, logout, descargas y exportaciones usan `false` porque modifican estado local, aunque el cliente REST permanezca restringido a GET. Las anotaciones orientan al cliente; el bloqueo de métodos en código es la restricción efectiva.

## Recurso y prompts

- `upacifico://guide`: guía de alcance institucional, fuentes y privacidad en Markdown.
- `revisar_semana(courseId, since, until)`: solicita revisar anuncios, actividades y calendario.
- `revisar_curso(courseId)`: orienta la lectura de contenidos, sílabo y notas.
- `descargar_materiales(courseId)`: solicita descargar y revisar fallos/omisiones.
- `leer_material(path)`: solicita leer un documento ya descargado y citar rutas/páginas.
- `revisar_mis_cursos(courseIds, since, until)`: combina secciones seleccionadas por IDs separados por comas, fechas y notas propias.

Los prompts proponen instrucciones para el asistente, no ejecutan operaciones ni alteran permisos por sí mismos.
