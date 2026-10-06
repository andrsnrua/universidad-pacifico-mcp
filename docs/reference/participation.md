# Participación, asistencia y consultas propias

[Índice de documentación](../README.md)

Estas funciones usan los endpoints públicos de lectura del [catálogo oficial de Blackboard Learn](https://developer.blackboard.com/portal/displayApi/Learn). El catálogo describe el contrato de API; no garantiza acceso en todas las cuentas de la UP. Cada error de permisos se conserva y las respuestas académicas se entregan únicamente al cliente conectado.

## Discusiones Ultra

`blackboard_list_discussions` lista discusiones accesibles y admite filtros por título y si son evaluables. `blackboard_get_discussion` devuelve el tema y sus metadatos. Estas rutas públicas corresponden a cursos Ultra; no prometen compatibilidad con los foros de cursos Original.

`blackboard_list_discussion_messages` y `blackboard_list_discussion_replies` devuelven mensajes y respuestas conservando IDs, `parentId` y `threadId`. Consultan mensajes `Published` por defecto. `status` puede ser `Published`, `Deleted` o `Draft`, siempre con los permisos del proveedor. `onlyMine: true` fija el autor a la cuenta autenticada; el cliente no elige un usuario arbitrario. `groupId` filtra el grupo y no concede acceso a otros grupos.

Las colecciones se paginan sobre el mismo endpoint con un límite de 10 000 elementos. No se crean publicaciones, respuestas, borradores ni cambios de lectura. Una lista vacía significa que Blackboard completó esa consulta sin devolver discusiones, no que todos los cursos de la institución carezcan de foros.

## Grupos y conjuntos

`blackboard_list_groups` usa la API v2 y conserva descripción, disponibilidad y configuración publicadas. `name` busca por coincidencia; `inGroupSet` es un booleano que selecciona grupos dentro o fuera de conjuntos. `blackboard_get_group` obtiene el detalle de un grupo y `blackboard_list_group_sets` usa la ruta `/groups/sets`.

La [guía oficial de grupos](https://docs.blackboard.com/docs/blackboard/rest-apis/hands-on/groups-in-rest-api) diferencia conjuntos y grupos. Poder leer una lista no garantiza poder consultar sus integrantes o los detalles de un conjunto. Estas herramientas no exponen listas de miembros, confirman pertenencia ni inscriben estudiantes.

## Asistencia por curso

`blackboard_list_course_meetings` consulta sesiones registradas en la herramienta de asistencia; no constituye un horario académico completo. `blackboard_get_my_attendance` consulta solo la cuenta actual y cruza los registros por `meetingId` con las sesiones del curso solicitado.

Este cruce es necesario: la documentación oficial de `/courses/{courseId}/meetings/users/{userId}` indica que sus registros no están filtrados por curso. El identificador de curso en esa ruta se utiliza para comprobar permisos. El MCP filtra antes de devolver los datos y nunca presenta registros de otra sección como asistencia de este curso.

Cada resultado contiene `meeting` y `attendance`. Si no hay un registro para una sesión, `attendance` vale `null`: no se deduce `Absent`. Se preservan los estados del proveedor, como `Present`, `Late`, `Absent` y `Excused`, sin calcular porcentajes ni reglas de evaluación. Una fuente inaccesible produce `complete: false` y avisos; registros asociados explícitamente a otra cuenta o sesiones duplicadas producen un error.

## Matrícula, notas y revisión

`blackboard_get_my_enrollment` lee inscripción, rol y condiciones publicadas en un curso de Blackboard. No equivale a matrícula académica y no consulta créditos, pagos o Campus Virtual administrativo.

`blackboard_get_grade_detail` obtiene la nota propia mediante la API v2, junto a la columna y sus intentos si `includeAttempts` no es `false` y la columna es de tipo `Attempts`. Conserva puntajes cero, valores ausentes, `displayGrade`, comentarios y exenciones. Un fallo en la consulta de la nota es un error; metadatos o intentos inaccesibles producen una respuesta parcial. Las notas, columnas e intentos explícitamente asociados a otra cuenta/columna se rechazan.

El esquema oficial `GradeV2` declara `status` deprecado y no fiable. Por ello la respuesta incluye `gradeStatusReliable: false`, conserva el valor histórico sin interpretarlo y no deduce un estado de entrega ni nota final. Los estados de intentos se mantienen separados de los datos de nota.

`blackboard_get_content_review_status` consulta el estado propio de un contenido revisable. Un contenido que informa `reviewable: false` devuelve `supported: false` y `reviewed: null` sin consultar el endpoint de revisión. Para contenidos revisables se conserva `reviewed: false` cuando está publicado. La lectura no marca el contenido como revisado ni acredita su comprensión. Un error de permisos no se transforma en `false`.

## Agenda de varios cursos

`blackboard_get_multi_course_agenda` reúne la agenda de entre 1 y 10 cursos elegidos por ID, elimina IDs duplicados y ordena los eventos por fecha. Mantiene el detalle de cada fuente y los cursos fallidos como `agenda: null`, con avisos. No mezcla secciones con nombres iguales ni interpreta vencimientos como tareas pendientes.

Ejemplo con IDs ficticios:

```json
{
  "courseIds": ["_101_1", "_202_1"],
  "since": "2026-10-05T00:00:00-05:00",
  "until": "2026-10-12T00:00:00-05:00"
}
```

Se mantiene el límite de 112 días, las fechas originales y `America/Lima`. No se expanden recurrencias ni se crean recordatorios. Las pruebas automatizadas y ejemplos usan datos ficticios; cualquier prueba con una cuenta institucional debe mantener la sesión y los resultados fuera del código y de los paquetes públicos.
