# Resolver problemas

[Índice de documentación](../README.md)

| Síntoma | Acción |
| --- | --- |
| El cliente no encuentra Node | Usa la ruta absoluta de `node` y de `dist/index.js`. |
| Falta `dist/index.js` | Ejecuta `npm ci --ignore-scripts` y `npm run build` dentro del proyecto. |
| Errores JSON-RPC al arrancar | Usa `node dist/index.js` directamente como proceso stdio; evita encabezados de npm. |
| No se abre el navegador | Instala Chrome/Edge o ejecuta `npm run browser:install`. Revisa el entorno gráfico y bloqueo de perfil. |
| El acceso vuelve a pedir MFA | Completa el login interactivo; el proveedor decide cuándo es necesario. |
| `blackboard_whoami` dice que no hay sesión | Ejecuta `npm run login` con el mismo `UP_MCP_SESSION_DIR` que usa el cliente. |
| El login se cancela por tiempo | Amplía el tiempo de herramienta en el cliente o autentica antes con `npm run login`. |
| Error 401 | Reautentica; la sesión remota puede haber caducado o sido revocada. |
| Error 403 | Revisa si la misma cuenta puede abrir esa sección/dato en el navegador. El MCP no amplía permisos. |
| Error 404 | Obtén otra vez el ID; un contenido puede haber sido eliminado o el endpoint cambiado. |
| Error 429 o 5xx | Espera antes de reintentar; evita descargar todos los cursos simultáneamente. |
| Falta una ponderación o fecha | Consulta el sílabo, cronograma o docente; no todos los datos aparecen en la API. |
| Faltan archivos | Revisa `failed`, `skipped`, `complete` y las referencias externas del manifiesto. |
| `outputDir` rechazado | Usa una subcarpeta relativa, sin `..`; configura la raíz con `UP_MCP_DOWNLOAD_DIR`. |
| Descarga excede cuota | Revisa espacio y archivos existentes o aumenta el límite dentro de los máximos documentados. |
| Un adjunto parece antiguo | La reutilización no detecta todos los reemplazos con igual ID/nombre. Verifica el archivo directamente en Blackboard. |

`npm run doctor` muestra rutas y estado **local** sin cookies ni consultas remotas. No confirma que la sesión continúe aceptada por Blackboard. No publiques su salida sin revisar rutas personales.

Para reportar un error, usa la plantilla del repositorio y ejemplos ficticios. Nunca envíes `session.json`, `sso-state.bin`, el perfil del navegador, URLs firmadas completas, notas ni materiales de tus cursos.
