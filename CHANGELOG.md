# Cambios

## 0.6.0 — 2026-10-05

- Reorganización de las 70 herramientas en once módulos MCP por función, con sesión, esquemas y respuestas compartidas.
- Separación de servidor, prompts y recursos; la integración Blackboard queda en autenticación, API y consultas académicas.
- README centrado en uso e instalación; documentación con índice, guías, referencia y desarrollo.
- Eliminación de referencias a aplicaciones ajenas y comentarios de migración que no describían este proyecto. Atribución original conservada en NOTICE y LICENSE.
- Referencia completa agrupada por función, enlaces internos actualizados y comprobación automática de documentación.
- Compilación limpia para excluir módulos antiguos de los paquetes. Se conservan el binario, nombres, parámetros y capacidades del contrato MCP.

## 0.5.0 — 2026-10-05

- Veinticuatro herramientas nuevas: fuentes institucionales, calendario y anuncios detallados, periodos de evaluación, estructura, búsquedas múltiples, comprobantes propios, revisión resumida, libros de notas, panorama de cursos y resumen con fuentes.
- Biblioteca privada: inventario, lectura y búsqueda de texto PDF/DOCX/PPTX/XLSX/UTF-8 e inspección de manifiestos. Worker con límites de tiempo, memoria y descompresión; sin OCR ni ejecución de documentos.
- Exportaciones de agenda y notas múltiples, asistencia, estructura, resumen y comprobantes. UID de calendario por sección y CSV protegido frente a fórmulas de texto.
- Catálogo de 70 herramientas y cinco prompts; nuevos `leer_material` y `revisar_mis_cursos`.
- Retroalimentación textual sin consulta de archivos por defecto; `includeAttemptFiles: true` conserva la consulta opcional y declara permisos fallidos. `attemptFilesRequested` indica el alcance consultado.
- Node.js mínimo 22.13.0 para PDF.js; dependencias actualizadas con correcciones compatibles.
- Correcciones de distribución: código de descargas incluido en Git, recorridos y manifiestos compatibles con alias de rutas de macOS, y worker PDF sin heredar cargadores de pruebas, con memoria acotada a 256 MiB.

## 0.4.0 — 2026-10-05

- Trece herramientas nuevas: discusiones Ultra, detalle, mensajes y respuestas; grupos, detalle y conjuntos; sesiones y asistencia propia; inscripción propia en Blackboard; detalle de una nota; estado de revisión; agenda de varios cursos. Catálogo de 46 herramientas.
- Asistencia filtrada por las sesiones del curso: el endpoint por usuario puede devolver registros de otros cursos. Los registros ausentes permanecen como `null` y no se convierten en faltas.
- Las consultas propias fijan la cuenta autenticada y rechazan registros explícitamente asociados a otra cuenta o columna.
- Detalle de nota v2 con fuentes parciales y aviso del campo histórico `grade.status`, que Blackboard declara no fiable.
- Agenda de hasta diez cursos, con selección por ID, deduplicación de cursos y avisos de fuentes inaccesibles.
- Documentación del contrato público y pruebas ficticias de permisos, cuentas, curso, paginación y parámetros. No se distribuyen datos de cuentas institucionales.

## 0.3.1 — 2026-10-05

- Corrige la ruta pública v1 de archivos de intentos y verifica primero su relación con la columna; conserva errores de permisos.
- Consulta adjuntos REST únicamente para tipos compatibles cuando Blackboard informa el tipo; los archivos incrustados se siguen leyendo.
- Las descargas conservan errores HTTP 400/404 de adjuntos compatibles en el manifiesto y limitan a 30 segundos las peticiones al CDN.
- Pruebas de regresión con respuestas ficticias para rutas, permisos, tipos de contenido y archivos inaccesibles. El catálogo conserva 33 herramientas.

## 0.3.0 — 2026-10-05

- Cinco herramientas nuevas: inventario de archivos, inventario de enlaces, búsqueda de anuncios, exportación de agenda ICS y exportación de notas CSV. Catálogo de 33 herramientas.
- Inventarios con filtros de extensión, rutas, IDs, límites y avisos de fuentes inaccesibles; ningún vínculo externo se abre automáticamente.
- Exportaciones privadas con nombres únicos, cuotas, límites de tamaño y opt-in para fuentes incompletas. No se modifica Blackboard.
- ICS con fechas UTC, identificadores estables por fuente/ID/fecha, escapes y plegado UTF-8. Es una copia sin sincronización ni expansión de recurrencias.
- CSV conserva puntajes cero, valores ausentes y campos de escala separados; neutraliza texto interpretable como fórmulas y rechaza notas identificadas con otra cuenta.
- El control de distribución detecta los nombres generados de exportaciones privadas. Documentación de formatos y pruebas de datos parciales, permisos y salidas locales.

## 0.2.0 — 2026-10-05

- Ocho herramientas nuevas: resumen del curso, búsqueda recursiva, candidatos a sílabo, detalle de actividad, detalle de intento, archivos de intento, categorías de notas y agenda del curso.
- Corrección del filtro de calendario (`courseId`) y límite de 112 días según la documentación de Blackboard.
- Las consultas combinadas señalan fuentes restringidas y resultados parciales; no confunden errores con ausencia de datos.
- Retroalimentación ahora devuelve un objeto con `results`, `complete` y archivos como `attemptFiles`; cambio de estructura respecto a 0.1.0.
- Las descargas recuperan instrucciones del contenido vinculado, presentan fechas de actividad en Lima y evitan ciclos en carpetas.
- Paginación estricta compartida para contenidos, adjuntos y cursos; las respuestas inválidas y límites no se ocultan.
- Matriz de capacidades y pruebas de búsqueda, agenda, instrucciones, permisos, rangos y resultados parciales.

## 0.1.0 — 2026-10-05

- Primera versión del MCP para Aula Virtual UP, con licencia ISC y atribución conservadas.
- Separación de servidor MCP, consultas, autenticación, descargas y seguridad.
- 20 herramientas enfocadas en Aula Virtual UP, una guía MCP y tres prompts.
- Cliente REST GET, paginación de colecciones y sesiones privadas del proyecto.
- Login manual en navegador, SSO adicional optativo y ausencia de telemetría.
- Documentación en español, ejemplos sin credenciales, CI y pruebas sintéticas.
- Generación de ZIP fuente y paquete npm con hashes y revisión de archivos.
