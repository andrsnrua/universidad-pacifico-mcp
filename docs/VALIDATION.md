# Validación de esta entrega

Entrega **0.5.0**, comprobada localmente el **5 de octubre de 2026** en Windows con Node.js **22.22.0**.

| Comprobación | Resultado |
| --- | --- |
| TypeScript y compilación | Aprobados. |
| Pruebas automatizadas | 176 aprobadas, 0 fallos y 0 omitidas. |
| Handshake MCP por stdio | Aprobado; identidad y versión correctas. |
| Catálogo de herramientas | 70 herramientas; anotaciones de consultas y cambios locales verificadas. |
| Recursos y prompts | 1 recurso y 5 prompts disponibles. |
| Validación de IDs, intervalos y falta de sesión | Errores MCP controlados. |
| Aislamiento entre cuentas y secciones | Verificado con fixtures, incluidas secciones con igual nombre. |
| Contenido de distribución | 90 archivos fuente y 85 archivos de paquete npm inspeccionados; sin directorios de sesión, perfiles ni descargas. |
| Funciones añadidas | Consultas entre secciones, comprobantes, notas, revisión, estructura, seis exportaciones y lectura PDF/Office/UTF-8 verificadas con fixtures, incluidos permisos, datos ausentes y documentos inválidos. |
| Bibliotecas y documentos | Auditoría npm sin vulnerabilidades conocidas en la ejecución local; límites de archivos, XML/ZIP y tiempo del worker verificados. |

Las pruebas con servicios HTTP usan únicamente loopback. En esta sesión se ejecutaron fuera del aislamiento restrictivo de Windows para permitir esas conexiones y operaciones de archivos temporales.

Las pruebas automatizadas usan respuestas ficticias, servidores de prueba en loopback y carpetas temporales. No requieren ni incluyen cuentas institucionales.

El pipeline contempla tipado TypeScript, pruebas unitarias, un proceso MCP real por stdio y revisión de archivos distribuidos. La comprobación manual de login, calendario y cursos con una cuenta UP es independiente y debe realizarla el usuario/mantenedor antes de asumir compatibilidad completa con su sección.

La matriz de GitHub Actions aprobó las seis combinaciones de Linux, macOS y Windows con Node 22 y 24 el 5 de octubre de 2026. La ejecución incluye instalación desde el lockfile, tipado, compilación, pruebas, protocolo MCP y revisión del paquete. Consulta la [ejecución comprobada](https://github.com/andrsnrua/universidad-pacifico-mcp/actions/runs/37382146370). Estas comprobaciones remotas usan exclusivamente datos ficticios y no una cuenta institucional.
