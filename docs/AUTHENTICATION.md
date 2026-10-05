# Autenticación y duración de sesiones

## Primer acceso

`up-mcp login` o `blackboard_login` abre un perfil local propio y navega a `https://aulavirtual.up.edu.pe/ultra`. El usuario completa cualquier selección de cuenta, contraseña, MFA o confirmación de acceso. El código no rellena contraseñas ni elige por el usuario la opción de mantener sesión iniciada.

El acceso solo se confirma cuando `/learn/api/public/v1/users/me` devuelve un usuario válido. Una cookie temprana o una redirección por sí sola no demuestra que el usuario haya entrado.

## Archivos privados

| Archivo/directorio | Contenido y protección |
| --- | --- |
| `session.json` | Cookies de Blackboard, token XSRF y metadatos. No cifrado por la aplicación; permisos de propietario en sistemas POSIX. |
| `browser-profile/` | Perfil Chromium con estado de navegación y potenciales cookies del proveedor. Su protección depende también del navegador y del sistema operativo. |
| `sso-state.bin` | Estado SSO Microsoft adicional, solo si se activó recordar SSO. DPAPI del usuario en Windows, AES-256-GCM con clave privada en macOS/Linux. |

Los permisos POSIX `0700`/`0600` no equivalen a una ACL de Windows. En Windows usa un directorio bajo una cuenta personal protegida y no compartas esa carpeta. Ningún archivo de sesión debe formar parte de un repositorio, una entrega o un reporte de error.

## Renovación

Las respuestas autenticadas pueden rotar cookies y actualizar la vigencia que informa Blackboard. Si la sesión parece vencida localmente, el servidor primero la consulta: una estimación local no debe invalidar una sesión que Blackboard aún acepte.

Si el proveedor permite reutilizar el perfil/estado previo, se puede intentar una renovación sin ventana. Si exige interacción, vuelve a iniciar sesión en el navegador. El MCP no garantiza acceso permanente ni evita MFA. La referencia local de tres horas se utiliza únicamente como fallback cuando no existe información de expiración; no es una política institucional garantizada.

Los intentos concurrentes se coordinan mediante bloqueo de perfil. Después de una renovación fallida hay una espera de cinco minutos para impedir reaperturas continuas; un nuevo login explícito puede reiniciar ese estado.

## Cierre y cambio de cuenta

`blackboard_logout` o `npm run logout` borra la sesión, el SSO adicional y el perfil de este MCP. Los materiales se conservan. No revoca todas las sesiones de Microsoft o UP ni elimina descargas hechas con otra herramienta.

No cierres sesión mientras una descarga o un login esté en curso. Para cambiar de cuenta, termina esas operaciones, cierra sesión y vuelve a entrar. Un proceso MCP corresponde a una cuenta; no está diseñado para alojar sesiones de varios usuarios.
