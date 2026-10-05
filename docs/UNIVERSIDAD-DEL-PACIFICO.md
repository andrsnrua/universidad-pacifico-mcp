# Alcance en la Universidad del Pacífico

## Servicios y evidencia

La integración apunta al Aula Virtual de la **UP de Perú**, con el origen fijo `https://aulavirtual.up.edu.pe`. El [portal oficial de plataformas UP](https://blackboard.up.edu.pe/) enlaza ese dominio para las categorías que muestra. Esto verifica el destino, pero no concede acceso a cualquier curso o programa: cada cuenta conserva sus permisos reales.

La [guía institucional de sílabos para departamentos](https://sites.google.com/up.edu.pe/silabo/tutoriales/departamentos) describe responsabilidades de asignatura/sección, unidades de aprendizaje, cronogramas y sistema de evaluación. También explica la publicación del sílabo en Blackboard. Por eso este MCP conserva los IDs de curso, recorre la estructura disponible y no presupone ponderaciones comunes para toda la universidad.

Estas fuentes se consultaron el **5 de octubre de 2026**. Las instrucciones de interfaz de documentos antiguos no se asumen como contratos actuales de API.

## Decisiones técnicas de esta adaptación

Las siguientes decisiones provienen del código de integración existente y de su funcionamiento, no de una garantía oficial de la UP:

| Particularidad | Comportamiento del proyecto |
| --- | --- |
| Cuenta institucional y redirecciones de acceso | El usuario inicia sesión en un navegador local; el MCP espera confirmación de `/users/me`. |
| SSO Microsoft/MFA | El usuario completa los pasos solicitados. La renovación solo funciona si el proveedor acepta el estado previo. |
| Cursos y secciones | Se consulta la lista de cursos de la cuenta; se usan IDs devueltos, no nombres inventados. |
| Periodos académicos | Se conserva `term` cuando Blackboard lo entrega. No se adivina el periodo a partir del nombre. |
| Organización del docente | Se recorren carpetas y páginas; no se exige una carpeta llamada «Semana 1» o «Sílabo». |
| Actividad y columna de notas | Se consultan ambos cuando existen. `contentId` permite buscar las instrucciones del contenido. |
| Notas y puntajes máximos | Se muestran valores publicados. Los pesos de evaluación se verifican en el sílabo de la sección. |
| Fechas | Se conservan los valores remotos. El asistente presenta fechas en `America/Lima` y declara ausencias. |
| Materiales con enlaces externos | Se registran como referencias; no se envían cookies de UP a esos destinos. |
| Contenidos no publicados o restringidos | Se informa de la ausencia o del error; no se intenta ampliar permisos. |

## Flujo de uso

1. Comprueba sesión con `blackboard_whoami`. Si falta, usa `blackboard_login`.
2. Obtén los cursos con `blackboard_list_courses` y selecciona el ID de la sección correcta.
3. Consulta anuncios y contenidos. Recorre las carpetas mediante `parentId`.
4. Abre el contenido con `blackboard_get_content` para revisar instrucciones y localizar el sílabo.
5. Consulta actividades, calendario y calificaciones según lo que la cuenta tenga autorizado.
6. Descarga materiales accesibles y revisa `failed`, `skipped` y `complete` en el manifiesto.

## Fronteras del producto

Este servidor no integra Campus Virtual administrativo, matrícula, pagos, correo, biblioteca, sistema de edición de sílabos ni videoconferencia. Un vínculo hacia esos servicios dentro de un curso sigue siendo una referencia externa. Las reglas de evaluación no se generalizan entre cursos, secciones o programas.

Los archivos académicos y las respuestas con notas son privados. Compartir el código del MCP no implica permiso para redistribuir materiales o información de otras personas.
