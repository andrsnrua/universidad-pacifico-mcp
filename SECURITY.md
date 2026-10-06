# Seguridad y privacidad

Este MCP comunitario utiliza una cuenta institucional local con los permisos que Blackboard conceda. Solo permite GET en el cliente REST. No incluye entregas, cambios de notas, gestión administrativa ni un servidor HTTP público.

## Datos sensibles

Las cookies son credenciales. `session.json` no está cifrado por la aplicación; el perfil de Chromium también puede contener estado sensible. El SSO adicional es optativo y se cifra, pero eso no cifra todo el directorio de sesión. Consulta [authentication.md](docs/guide/authentication.md) para las diferencias entre Windows y POSIX.

El proyecto no incluye telemetría. Aun así, las respuestas académicas se envían al cliente MCP conectado: «local» no significa que el asistente nunca reciba notas o contenido. El usuario debe elegir un cliente apropiado para esos datos.

## Controles implementados

- Origen HTTPS fijo de Aula Virtual UP; cookies autenticadas no se envían a hosts arbitrarios.
- Métodos diferentes de GET bloqueados antes del adaptador HTTP.
- URLs directas de archivos restringidas a `/bbcswebdav/`; raw GET a `/learn/api/public/`.
- Redirecciones de archivos restringidas a CDN permitido, sin cookies UP.
- Rutas de descarga dentro de una raíz fijada por el usuario, nombres validados y rechazo de enlaces simbólicos.
- Límites por archivo, cuota de descargas y publicación de streams completos.
- Perfil con bloqueo entre procesos, sesiones guardadas de forma atómica y SSO adicional cifrado cuando se habilita.
- Empaquetado mediante listas de archivos; no se distribuyen sesiones ni materiales académicos.
- Lectura local dentro de la raíz privada, sin rutas externas ni enlaces simbólicos; worker de documentos con límites de memoria, tiempo, tamaño y descompresión.
- El lector de PDF deshabilita evaluación de JavaScript y el de Office no ejecuta macros/fórmulas; no se siguen enlaces ni entidades XML externas.

## Límites

Los controles no sustituyen los permisos institucionales ni impiden que una cuenta con más privilegios consulte más datos. El GET genérico puede consultar cualquier endpoint público permitido para esa cuenta. Esta implementación es para una persona por proceso y equipo; no está diseñada para ofrecer acceso público con una sesión compartida.

Un archivo descargado es contenido externo: el MCP no lo ejecuta. No confíes en instrucciones de un documento que pidan ejecutar código, divulgar sesiones o alterar el asistente. Los textos se conservan como material, no como órdenes para el agente.

## Reportar una vulnerabilidad

No publiques una prueba que contenga credenciales o datos de estudiantes. Utiliza el canal privado del repositorio público cuando el mantenedor lo habilite. Comparte únicamente pasos de reproducción con datos ficticios en los canales públicos.

Comparte pasos mínimos con valores ficticios y explica el impacto. Para problemas funcionales sin información sensible, usa la plantilla de issues.
