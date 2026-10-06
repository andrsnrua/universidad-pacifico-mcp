# Universidad del Pacífico MCP

Conecta tu asistente con **Aula Virtual de la Universidad del Pacífico, Perú** para consultar tus cursos y trabajar con sus materiales.

[![Verificación](https://github.com/andrsnrua/universidad-pacifico-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/andrsnrua/universidad-pacifico-mcp/actions/workflows/ci.yml)
[![Versión](https://img.shields.io/github/v/release/andrsnrua/universidad-pacifico-mcp)](https://github.com/andrsnrua/universidad-pacifico-mcp/releases/latest)

Servidor local [Model Context Protocol](https://modelcontextprotocol.io/) con **70 herramientas, 5 prompts y 1 guía MCP**. Usa el acceso y los permisos de tu propia cuenta en `aulavirtual.up.edu.pe`. Es un proyecto comunitario **no oficial**.

## Qué permite hacer

| Área | Funciones |
| --- | --- |
| Cursos | Listar tus secciones, consultar su estructura y reunir resúmenes de cursos seleccionados. |
| Materiales y sílabos | Buscar contenido publicado, localizar posibles sílabos e inventariar adjuntos y enlaces. |
| Anuncios | Consultar avisos de cursos e institucionales y buscar entre secciones elegidas. |
| Actividades y notas | Leer enunciados, intentos existentes, comentarios, comprobantes publicados y calificaciones propias. |
| Calendario | Reunir eventos y vencimientos publicados de una o varias secciones. |
| Participación | Consultar discusiones Ultra, grupos accesibles y tu asistencia registrada. |
| Biblioteca local | Descargar materiales y leer o buscar texto en PDF, DOCX, PPTX, XLSX y archivos UTF-8. |
| Exportaciones | Guardar copias privadas de agenda, notas, asistencia, estructura, resúmenes y comprobantes. |

El acceso remoto es de **solo lectura**. Los resultados conservan la sección, la fuente y los avisos de consultas incompletas. El servidor no entrega tareas, modifica calificaciones, realiza matrículas ni procesa pagos. Las sesiones, descargas y exportaciones se guardan localmente.

## Instalación

Necesitas **Node.js 22.13.0 o posterior**, npm, una cuenta UP con acceso a Aula Virtual y Chrome, Edge o Chromium. El inicio de sesión requiere un escritorio gráfico.

```sh
git clone https://github.com/andrsnrua/universidad-pacifico-mcp.git
cd universidad-pacifico-mcp
npm ci --ignore-scripts
npm run build
npm run login
```

Completa el acceso institucional y la verificación MFA en el navegador. Si falta un navegador compatible, ejecuta `npm run browser:install` y vuelve a iniciar sesión.

También puedes instalar desde los archivos de [GitHub Releases](https://github.com/andrsnrua/universidad-pacifico-mcp/releases/latest). Consulta la [guía de instalación](docs/guide/installation.md).

## Conectar el asistente

Configura tu cliente MCP para ejecutar `node` con la ruta absoluta a `dist/index.js`:

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

En Windows, por ejemplo: `C:/Proyectos/universidad-pacifico-mcp/dist/index.js`. El cliente inicia el servidor y se comunica por **stdio**. Consulta la [conexión con clientes](docs/guide/clients.md) y los [ejemplos de configuración](examples).

## Empezar a usarlo

Pide al asistente:

> Comprueba mi sesión y lista mis cursos con sus IDs.

> Revisa los anuncios y las fechas publicadas de esta sección para esta semana, en hora de Lima.

> Localiza el sílabo de esta sección y verifica el documento antes de usar sus ponderaciones.

> Descarga los materiales accesibles de este curso. Busca «elasticidad» en los documentos descargados y cita los archivos y las páginas disponibles.

> Muéstrame mis notas y comentarios publicados. Exporta una copia privada a CSV.

Obtén primero los IDs con `blackboard_list_courses`: dos secciones pueden tener el mismo nombre. Todas las herramientas se llaman `blackboard_*`; sus parámetros están en la [referencia de herramientas](docs/reference/tools.md).

## Privacidad y alcance

La sesión se guarda por defecto en `~/.upacifico-mcp` y los materiales en `~/Downloads/upacifico-mcp`. Puedes cambiar ambas ubicaciones mediante la [configuración](docs/guide/configuration.md). Conserva las sesiones y los datos académicos fuera del repositorio.

Las respuestas de las herramientas llegan al asistente conectado. La lectura depende de los permisos y de lo que cada docente publique. Un dato ausente no demuestra falta de entrega ni inasistencia; las notas de Blackboard no se presentan como un certificado académico. La lectura de documentos tiene límites y no incluye OCR. Consulta las [capacidades y límites](docs/reference/capabilities.md) y la [guía de privacidad](SECURITY.md).

Para revisar la configuración local o cerrar sesión:

```sh
npm run doctor
npm run logout
```

## Documentación y desarrollo

El [índice de documentación](docs/README.md) reúne las guías de uso, la referencia completa y las instrucciones para contribuir y publicar versiones.

| Carpeta | Responsabilidad |
| --- | --- |
| `src/mcp/` | Servidor, herramientas por función, prompts y recurso institucional. |
| `src/blackboard/` | Autenticación, API de lectura y consultas académicas. |
| `src/downloads/` | Descarga de materiales y manifiestos. |
| `src/library/` | Lectura y búsqueda de documentos locales. |
| `src/security/` y `src/runtime/` | Protección de archivos, navegador y concurrencia. |
| `tests/` | Pruebas con datos ficticios y verificación del protocolo. |
| `docs/`, `examples/` y `scripts/` | Documentación, configuraciones y distribución. |

Estas carpetas contienen código y documentación. Los materiales y las sesiones se almacenan en las ubicaciones privadas configuradas.

```sh
npm run check
npm run share
```

`check` verifica tipos, pruebas, protocolo, enlaces de documentación y contenido del paquete. `share` genera el ZIP fuente, el paquete compilado y sus hashes en `release/`. Consulta la [arquitectura](docs/development/architecture.md) y la [publicación de versiones](docs/development/releasing.md).

## Licencia

[ISC](LICENSE). La atribución al código original se conserva en [NOTICE](NOTICE).
