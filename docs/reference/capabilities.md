# Capacidades y límites verificables

[Índice de documentación](../README.md)

Este proyecto sirve únicamente a **Aula Virtual Blackboard de la Universidad del Pacífico, Perú**. Implementar una consulta no garantiza que la UP la habilite para todas las cuentas o secciones. Las pruebas automatizadas usan datos ficticios; las pruebas con una cuenta institucional se realizan y conservan fuera del repositorio.

| Necesidad | Implementación disponible | Límite |
| --- | --- | --- |
| Identificar una sección | Cursos de la cuenta y detalle por ID | No interpreta códigos de matrícula ni busca cursos ajenos a los permisos. |
| Revisar un curso | Resumen con anuncios, contenidos raíz, actividades y notas | Las fuentes restringidas se declaran; el resumen no recorre todas las carpetas. |
| Encontrar materiales | Búsqueda remota recursiva con rutas e IDs | Títulos, texto publicado y nombres de archivos; para el interior de documentos usa la biblioteca local. |
| Inventariar archivos y enlaces | Adjuntos REST, archivos incrustados y vínculos publicados por carpeta | Filtros por extensión del nombre; no sigue vínculos ni descubre servicios externos. |
| Buscar avisos | Términos en títulos y texto de anuncios accesibles | Respeta permisos y límite de resultados. |
| Localizar el sílabo | Candidatos por nombre y texto; consulta adjuntos REST | Requiere revisar el documento y su sección; no verifica aprobación institucional. |
| Entender una actividad | Columna, contenido vinculado, instrucciones, adjuntos e intentos | Solo los campos publicados y accesibles; no resuelve ni envía evaluaciones. |
| Revisar intentos y comentarios | Lista/detalle de intentos y archivos asociados | Un archivo del intento puede ser una entrega del estudiante, no una corrección. |
| Consultar notas | Notas, columnas, puntajes y categorías | No calcula promedio ponderado ni certifica una nota final. |
| Revisar discusiones | Lista, tema, mensajes y respuestas en cursos Ultra | Solo contenido accesible; no publica ni garantiza foros Original. |
| Consultar grupos | Lista, detalle y conjuntos de grupos | No acredita pertenencia ni enumera integrantes. |
| Consultar asistencia | Sesiones y registros propios filtrados por curso | Un registro ausente no es una falta ni las sesiones equivalen al horario completo. |
| Revisar inscripción y contenido | Matrícula propia en Blackboard y estado de revisión | No certifica matrícula académica ni marca contenidos como revisados. |
| Detallar una nota | Nota v2, columna e intentos propios accesibles | `grade.status` es histórico y no fiable; no deduce entregas pendientes. |
| Organizar fechas | Calendario y agenda con vencimientos y eventos | Hasta 112 días por consulta; no determina entregas pendientes ni horario completo. |
| Reunir fechas de varios cursos | Agenda combinada de hasta 10 IDs, con avisos por fuente | Selección explícita; conserva las secciones y los cursos inaccesibles. |
| Exportar fechas y notas | Copia ICS de la agenda y CSV de notas | Datos privados; no sincroniza, expande recurrencias ni calcula promedios. |
| Descargar materiales | Archivos, páginas e instrucciones, con manifiesto local | Permisos, quotas y enlaces externos pueden impedir una descarga completa. |
| Mantener acceso | Login manual, sesión local y renovación cuando el proveedor lo permite | No garantiza sesión permanente ni evita MFA. |
| Consultar fuentes institucionales | Avisos, calendarios, eventos y periodos de evaluación accesibles | Solo Aula Virtual; no otros portales ni periodos oficiales de matrícula. |
| Revisar comprobantes | Recibos publicados de intentos propios | Ausencia de recibo no demuestra falta de entrega. |
| Consultar varias secciones | Búsquedas, panoramas, libros de notas y agenda por IDs | Presupuestos acotados y fuentes fallidas explícitas; no promedio general. |
| Leer archivos descargados | Texto de PDF, DOCX, PPTX, XLSX y UTF-8 | Límites de páginas y tamaño; sin OCR, macros, fórmulas ni formato visual. |
| Buscar y revisar la biblioteca | Texto local y verificación de existencia/tamaño de manifiestos | Solo raíz de descargas; no lectura externa ni verificación de hashes. |
| Guardar más copias privadas | Asistencia, estructura, resúmenes, comprobantes y exportaciones múltiples | Sin publicación ni sincronización automática. |

Las consultas combinadas explican su alcance mediante `complete`, `warnings` y, en búsqueda, `truncated`/`limits`. Una búsqueda incompleta no permite concluir que el sílabo o material no existe.

Compartir este proyecto significa distribuir código y documentación. No incluye sesiones, materiales institucionales ni datos de estudiantes. Es una integración comunitaria, sin publicación ni respaldo oficial de la universidad.

## Ejemplos para el asistente

1. «Lista mis cursos con sus IDs y confirma la sección antes de consultar.»
2. «Resume el curso `_12345_1` e indica qué fuentes no pudiste leer.»
3. «Busca “elasticidad” incluyendo nombres de adjuntos. Indica límites y carpetas que no pudiste abrir.»
4. «Localiza candidatos a sílabo de esta sección. Muéstrame sus IDs y no inventes porcentajes.»
5. «Abre la actividad `_67890_1` del curso `_12345_1` y muéstrame las instrucciones publicadas.»
6. «Muestra la agenda del curso entre el 5 y el 12 de octubre, con fechas en Lima y la fuente de cada evento.»

Los IDs son ficticios. Reemplázalos por los valores devueltos por Blackboard. Consulta los parámetros de las 70 herramientas en [tools.md](tools.md), los detalles de participación en [participation.md](participation.md), los formatos en [exports.md](exports.md) y la evidencia de ejecución en [validation.md](../development/validation.md).
