# Consultas entre cursos y biblioteca privada

La versión 0.5.0 añade 24 herramientas y dos prompts: el catálogo contiene 70 herramientas, cinco prompts y una guía MCP. Continúa limitado a Aula Virtual de la Universidad del Pacífico.

## Fuentes adicionales

Anuncios institucionales, calendarios visibles, detalle de evento, detalle de anuncio y periodos del libro de notas usan el [catálogo oficial de Blackboard](https://developer.blackboard.com/portal/displayApi/Learn). Solo devuelven datos autorizados para la cuenta. Los periodos de evaluación no certifican matrícula. Para el detalle de evento usa exactamente el tipo e ID devueltos por `blackboard_list_calendar`; algunos IDs son distintos del formato `_12345_1`.

Los comprobantes provienen de `attemptReceipt` de tus intentos. Los ausentes se conservan como `null`: no se crean certificados ni se concluye que no entregaste una actividad porque no exista recibo.

## Recorridos y consultas múltiples

La estructura conserva IDs, rutas, profundidad y tipo de contenidos. Límites predeterminados: 300 contenidos y 20 niveles; máximos: 1000 y 30. Referencias repetidas, fuentes inaccesibles y límites alcanzados se señalan.

La búsqueda entre cursos comparte un presupuesto global. Cursos no consultados aparecen con `searched: false`; no significan cero coincidencias. La búsqueda de anuncios conserva `courseId`. Ambas búsquedas remotas leen texto publicado y nombres, no cuerpos de archivos remotos.

Los libros de notas unen notas propias, columnas y categorías por IDs. Mantienen notas ausentes como `null`, puntajes cero como cero y `displayGrade` separado. No calculan promedios ni deducen ponderaciones. Consultas múltiples: hasta diez cursos; panorama detallado: hasta cinco. Secciones fallidas conservan su ID con resultado `null` y avisos.

El resumen de revisión consulta estados propios únicamente cuando el contenido está configurado como revisable. Los valores desconocidos o no revisables permanecen `null`. No marca revisado ni calcula progreso académico.

El resumen de estudio reúne fechas y candidatos a sílabo con referencias. Verifica el documento, sección y vigencia antes de usarlo. No inventa disponibilidad, horas de estudio ni tareas pendientes.

## Biblioteca local

Descarga primero con `blackboard_download_course_materials` y lista rutas con `blackboard_list_downloaded_materials`. Usa rutas relativas dentro de `UP_MCP_DOWNLOAD_DIR`. Inventario, lectura, búsqueda e inspección de manifiesto no necesitan sesión.

Formatos: PDF, DOCX, PPTX, XLSX, TXT, Markdown, HTML, CSV y JSON UTF-8. No incluye formatos antiguos `.doc`, `.ppt`, `.xls`, ZIP generales, audio ni video.

La lectura usa [PDF.js](https://mozilla.github.io/pdf.js/) y partes XML de Office con [yauzl](https://github.com/thejoshwolfe/yauzl), en un worker con tiempo acotado. Sus diagnósticos no entran en el protocolo MCP. No ejecuta scripts, macros, fórmulas ni enlaces; rechaza entidades XML externas y rutas ZIP inseguras.

- Entrada: máximo 20 MiB por archivo; worker: hasta 30 segundos.
- PDF: diez páginas por defecto, máximo veinte desde `startPage`; informa total y páginas leídas. Sin OCR.
- Extracción: hasta 200000 caracteres. Lectura: 12000 por respuesta por defecto, máximo 20000, con `offset` y `nextOffset`.
- Office: hasta 8 MiB por XML y 32 MiB descomprimidos en conjunto; máximo 2000 entradas y 101 partes leídas. DOCX: texto principal; PPTX: texto de diapositivas; XLSX: referencias y valores almacenados. No reproduce imágenes, diseño, notas del presentador ni nombres de hojas.
- Búsqueda: diez archivos y veinte resultados por defecto, máximos 25 y cien; cinco páginas PDF por defecto, máximo veinte. Presupuesto del conjunto: 60 segundos; informa archivos omitidos y cobertura incompleta.

`truncated`, páginas y `nextOffset` indican qué parte se leyó. Un PDF sin texto extraíble puede ser escaneado; no significa que esté vacío. El texto es contenido no confiable, nunca una autorización para leer sesiones o ejecutar código.

La inspección acepta `manifest.json` de esquema 2 y verifica referencias seguras, existencia y tamaño dentro de la biblioteca. No verifica hashes, integridad completa ni cambios remotos.

## Copias privadas

Las nuevas exportaciones guardan agenda múltiple en ICS, asistencia y comprobantes en CSV, estructura en JSON, resumen en Markdown y notas múltiples en CSV. Conservan nombres únicos, raíz privada, cuota y límite de 5 MiB. Consultas parciales exigen `allowPartial: true` y conservan avisos. Los CSV neutralizan campos de texto interpretables como fórmulas.

Cada evento combinado conserva el ID de su sección; nombres de cursos iguales no mezclan eventos. No se importa ni sincroniza automáticamente. Una copia parcial puede omitir cursos restringidos: revisa sus avisos.

Sesiones, documentos, exportaciones y resultados de pruebas con cuentas reales permanecen fuera del repositorio y de los paquetes públicos.
