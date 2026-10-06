# Validación

[Índice de documentación](../README.md)

Versión **0.6.0**, verificada localmente el **5 de octubre de 2026** en Windows con Node.js **22.22.0**.

## Comprobaciones locales

| Comprobación | Resultado |
| --- | --- |
| Tipos y compilación limpia | Aprobados; sin variables ni parámetros sin usar. |
| Pruebas automatizadas | 176 aprobadas, 0 fallos y 0 omitidas. |
| Protocolo MCP por stdio | Identidad y versión correctas; 70 herramientas, 5 prompts y 1 recurso. |
| Compatibilidad de la reorganización | Catálogo, esquemas de entrada, anotaciones, prompts y recurso iguales a 0.5.0. |
| Documentación | Enlaces locales existentes; catálogo completo organizado por función. |
| Distribución | Código fuente y paquete compilado inspeccionados mediante listas permitidas. |
| Aislamiento | Pruebas de cuentas, secciones, rutas, permisos, paginación y datos ausentes. |
| Documentos | Lectura PDF/Office/UTF-8, límites de extracción y rechazo de archivos inseguros. |

Las pruebas usan datos ficticios, servidores de prueba en loopback y carpetas temporales. No necesitan acceso a una cuenta institucional ni distribuyen documentos académicos, cookies o perfiles.

## Compatibilidad en CI

[GitHub Actions](https://github.com/andrsnrua/universidad-pacifico-mcp/actions/workflows/ci.yml) ejecuta `npm run check` sobre cada cambio con esta matriz:

| Sistema | Node.js |
| --- | --- |
| Linux | 22 y 24 |
| Windows | 22 y 24 |
| macOS | 22 y 24 |

Las seis combinaciones comprueban instalación desde el lockfile, tipos, compilación, pruebas, protocolo, documentación y empaquetado. El resultado de cada commit se consulta en su ejecución de Actions.

## Alcance institucional

Las pruebas automatizadas validan comportamiento técnico con respuestas simuladas. Los permisos, el contenido publicado, el login y la configuración de cada sección dependen de Aula Virtual UP. Una comprobación manual con cuenta propia debe mantener los resultados académicos y las credenciales en almacenamiento privado.
