# Universidad del Pacífico MCP

**Tu Aula Virtual de la UP, conectada con tu asistente.**

[Repositorio](https://github.com/andrsnrua/universidad-pacifico-mcp) · [Descargar la última versión](https://github.com/andrsnrua/universidad-pacifico-mcp/releases/latest) · [Reportar un problema](https://github.com/andrsnrua/universidad-pacifico-mcp/issues)

Servidor [Model Context Protocol](https://modelcontextprotocol.io/) local, comunitario y **no oficial** para Blackboard de la **Universidad del Pacífico, Perú**. Permite consultar cursos, anuncios, actividades, calendario, calificaciones y materiales con los permisos de tu propia cuenta.

Este proyecto contiene únicamente el MCP de la UP. Funciona de forma independiente y no requiere NexoSavia, NotebookLM ni una aplicación de escritorio propia.

## Qué puedes hacer

- Identificar tus cursos y sus secciones sin mezclar asignaturas con nombres similares.
- Revisar anuncios, carpetas, páginas, enunciados y adjuntos.
- Consultar actividades, intentos ya existentes, notas y retroalimentación.
- Consultar discusiones Ultra, sus temas, mensajes y respuestas accesibles.
- Revisar grupos publicados, conjuntos de grupos y tu inscripción en cada curso de Blackboard.
- Consultar sesiones y asistencia propia, filtrando las sesiones del curso elegido; leer el estado de revisión de contenidos.
- Reunir el detalle de una nota con sus comentarios e intentos y combinar agendas de hasta diez cursos por ID.
- Buscar títulos, texto publicado y nombres de archivos en las carpetas de una sección.
- Obtener inventarios de archivos por extensión y enlaces publicados, sin abrir servicios externos.
- Buscar términos en los anuncios y guardar copias de la agenda como `.ics` y de las notas como CSV.
- Localizar posibles sílabos y recuperar instrucciones del contenido vinculado a una actividad.
- Reunir el resumen de un curso y una agenda de eventos y vencimientos publicados.
- Leer eventos publicados en Blackboard dentro de un intervalo de fechas.
- Descargar materiales del curso y conservar su estructura, indicaciones y procedencia en un manifiesto local.
- Usar 70 herramientas, 5 prompts de estudio y una guía institucional como recurso MCP.

También puedes consultar anuncios institucionales, calendarios y comprobantes de entrega; buscar entre cursos elegidos; reunir libros de notas propios y leer texto de PDF, Word, PowerPoint y Excel ya descargados. La biblioteca permite búsquedas e inspección de manifiestos, y las exportaciones guardan copias privadas de asistencia, estructura, resúmenes, comprobantes y datos de varias secciones. Consulta [STUDENT-WORKFLOWS.md](docs/STUDENT-WORKFLOWS.md) para sus límites.

El cliente REST solo permite `GET`. El MCP no entrega tareas, cambia notas, realiza matrículas ni procesa pagos. Las descargas y el inicio/cierre de sesión sí modifican archivos locales.

## Inicio rápido

Necesitas Node.js 22.13.0 o posterior, npm y una cuenta con acceso a [Aula Virtual UP](https://aulavirtual.up.edu.pe). Para autenticarte, usa un equipo con escritorio gráfico y Chrome, Edge o Chromium. La implementación es multiplataforma; consulta la validación de cada entrega en [VALIDATION.md](docs/VALIDATION.md).

Descarga el ZIP de código desde [GitHub Releases](https://github.com/andrsnrua/universidad-pacifico-mcp/releases/latest), o clona el repositorio:

```sh
git clone https://github.com/andrsnrua/universidad-pacifico-mcp.git
cd universidad-pacifico-mcp
```

Desde la carpeta `universidad-pacifico-mcp`:

```sh
npm ci --ignore-scripts
npm run build
npm run doctor
npm run login
```

Completa tú mismo el acceso y cualquier verificación de Microsoft/MFA en el navegador. No compartas tu contraseña con el asistente. Si no se puede abrir un navegador:

```sh
npm run browser:install
npm run login
```

Enlaza el MCP con tu cliente. Para Codex, copia [examples/codex-config.toml](examples/codex-config.toml) y reemplaza la ruta absoluta; los detalles están en [CLIENTS.md](docs/CLIENTS.md). En clientes que usan `mcpServers`, la configuración es:

```json
{
  "mcpServers": {
    "universidad-pacifico": {
      "command": "node",
      "args": ["/ruta/absoluta/universidad-pacifico-mcp/dist/index.js"]
    }
  }
}
```

En Windows usa una ruta como `C:/Proyectos/universidad-pacifico-mcp/dist/index.js`. Si el cliente no encuentra `node`, especifica también su ruta absoluta. El proceso se ejecuta por **stdio**; iniciarlo manualmente deja el terminal esperando mensajes MCP. Usa `node dist/index.js` en el cliente, para que los encabezados de npm no contaminen el protocolo.

## Cómo está adaptado a la UP

El destino se fija en `aulavirtual.up.edu.pe`, que enlaza el [portal oficial de plataformas de la UP](https://blackboard.up.edu.pe/). Cada curso conserva su ID y la información que entregue Blackboard; no se presupone un esquema de nombres, carpetas o periodos.

La [guía institucional de sílabos](https://sites.google.com/up.edu.pe/silabo/tutoriales/departamentos) distingue asignatura y sección. Consulta el sílabo y el cronograma publicados por el docente para entender fechas y ponderaciones. El MCP no inventa porcentajes de evaluación ni presenta las notas de Blackboard como un certificado académico. Revisa [UNIVERSIDAD-DEL-PACIFICO.md](docs/UNIVERSIDAD-DEL-PACIFICO.md).

## Primeras preguntas al asistente

> Comprueba mi sesión en Aula Virtual y muéstrame mis cursos, con sus identificadores.

> Revisa los anuncios, actividades y eventos de este curso para esta semana. Muestra las fechas en hora de Lima y distingue lo que no está publicado.

> Busca el sílabo de esta sección y muéstrame los candidatos con sus IDs. Comprueba el documento antes de usar sus ponderaciones.

> Busca «elasticidad» entre los materiales publicados, incluyendo nombres de adjuntos. Indica si la búsqueda quedó incompleta.

> Lista los PDF y las diapositivas de esta sección con su ubicación. Busca anuncios que mencionen cambios de fecha.

> Exporta la agenda publicada de esta semana a un archivo ICS local y mis notas a CSV. Señala si falta alguna fuente.

> Combina la agenda de estas secciones y muestra mi asistencia solo para las sesiones registradas en cada una. No interpretes registros ausentes como faltas.

> Lista las discusiones disponibles de este curso Ultra y muestra los mensajes publicados. Lee mi estado de revisión de este contenido sin modificarlo.

> Descarga los materiales accesibles de este curso y resume los archivos omitidos o fallidos del manifiesto.

Las herramientas se llaman `blackboard_*`. Los prompts disponibles son `revisar_semana`, `revisar_curso`, `descargar_materiales`, `leer_material` y `revisar_mis_cursos`. Consulta todos los parámetros en [TOOLS.md](docs/TOOLS.md).

## Privacidad y sesiones

Por defecto, la sesión se guarda en `~/.upacifico-mcp` y los materiales en `~/Downloads/upacifico-mcp`, fuera del código. El proyecto no incluye telemetría, contraseñas ni cuentas preconfiguradas. Recordar el estado SSO adicional requiere activarlo expresamente.

El MCP corre localmente, pero **los datos que devuelva una herramienta llegan al cliente/asistente que conectaste**. Revisa su política antes de consultar notas o entregas. Las sesiones son credenciales sensibles aunque no contengan una contraseña.

```sh
npm run logout
```

Esto elimina la sesión y el perfil local del MCP. No borra los materiales descargados ni revoca todas tus sesiones institucionales. Variables de entorno y detalles: [CONFIGURATION.md](docs/CONFIGURATION.md), [AUTHENTICATION.md](docs/AUTHENTICATION.md) y [SECURITY.md](SECURITY.md).

## Estructura

```text
src/
  index.ts                   Inicio por stdio y utilidades login/logout/doctor
  mcp/                       Servidor, guía institucional, recurso y prompts
  blackboard/
    config.ts                Dominio UP y carpeta privada de sesión
    tools.ts                 Catálogo de herramientas y esquemas
    auth/                    Navegador, sesiones, renovación y SSO opcional
    api/                     Cliente GET, paginación, cursos y actividades
    services/                Búsqueda, sílabos, inventarios, agenda y exportaciones
  downloads/                 Recorrido de materiales y manifiesto
  library/                   Lectura y búsqueda local de PDF, Office y texto
  security/                  Rutas, cuotas y escritura segura
  runtime/                   Navegador y coordinación de concurrencia
tests/                       Pruebas sintéticas y protocolo stdio
docs/                        Instalación, arquitectura, UP y publicación
examples/                    Configuraciones de clientes sin credenciales
scripts/                     Pruebas y distribución verificable
.github/                     CI y plantillas para colaborar
```

## Desarrollo y distribución

```sh
npm run check
npm run share
```

`check` verifica tipos, pruebas, arranque MCP y contenido del paquete. `share` además crea en `release/` un ZIP de código fuente, un paquete npm `.tgz` y sus hashes SHA-256. No publica nada en Internet. Instrucciones: [PUBLISHING.md](docs/PUBLISHING.md).

## Límites conocidos

- El acceso y la duración de sesión dependen de la UP y del proveedor de identidad.
- Calendario, notas y contenidos pueden responder `403` o estar incompletos según permisos o publicación.
- La búsqueda remota examina texto publicado y nombres de archivos. La biblioteca local permite leer y buscar texto de PDF, Word, PowerPoint y Excel descargados, con límites explícitos y sin OCR. El sílabo se devuelve como candidato, no como documento certificado.
- La agenda reúne fechas publicadas en intervalos de hasta 112 días; no identifica automáticamente entregas pendientes ni calcula la nota final. Consulta la [matriz de capacidades](docs/CAPABILITIES.md).
- Los archivos `.ics` son copias de las fechas devueltas; no expanden recurrencias ni sincronizan cambios posteriores. Las notas CSV son privadas. Consulta [EXPORTS.md](docs/EXPORTS.md).
- Los enlaces externos se registran; no se descargan ni se autentican automáticamente.
- Discusiones Ultra, grupos y asistencia dependen de la configuración y los permisos de cada curso. Un registro ausente no implica inasistencia, ni una lista de grupos acredita pertenencia. Consulta [PARTICIPATION.md](docs/PARTICIPATION.md).
- Reutilizar un ID/nombre de adjunto puede impedir detectar una sustitución remota. No se promete sincronización perfecta.
- El MCP tiene una cuenta por proceso y transporte stdio. No incluye servidor público HTTP ni gestión multiusuario.
- Las pruebas automatizadas usan datos ficticios; no sustituyen una comprobación manual con tu cuenta institucional.

## Licencia y atribución

Licencia [ISC](LICENSE). El código de integración se deriva de [Campus CLI](https://github.com/alejooroncoy/campus-cli) y de su adaptación local en NexoSavia. Se conservan el aviso y la licencia original; consulta [NOTICE](NOTICE). No existe afiliación ni respaldo oficial de la Universidad del Pacífico, Microsoft o el proveedor de Blackboard.
