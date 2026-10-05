# Compartir y publicar

## Entregas locales

```sh
npm ci --ignore-scripts
npm run share
```

Se ejecutan comprobaciones y se generan estos archivos en `release/`:

- `universidad-pacifico-mcp-0.5.0-source.zip`: código, pruebas, documentación, configuración de ejemplo y CI. Incluye la carpeta raíz del proyecto.
- `universidad-pacifico-mcp-0.5.0.tgz`: paquete npm compilado con documentación y licencia.
- `SHA256SUMS.txt`: hashes de ambas entregas.

Los archivos se preparan mediante listas explícitas. No se empaquetan `node_modules`, sesiones, el perfil de Chromium, descargas, `.git`, `.env` real ni archivos personales. El control de patrones de secretos es una comprobación adicional, no una garantía de detectar cualquier secreto posible.

El ZIP es autónomo: extrae su carpeta y usa `npm ci --ignore-scripts` para instalar con el lockfile incluido. El paquete npm usa una lista `files` limitada al runtime compilado, documentación y ejemplos.

## Crear un repositorio público

Repositorio de esta distribución: [andrsnrua/universidad-pacifico-mcp](https://github.com/andrsnrua/universidad-pacifico-mcp). Las versiones descargables se publican en [GitHub Releases](https://github.com/andrsnrua/universidad-pacifico-mcp/releases). Cada versión incluye código fuente, paquete npm compilado y `SHA256SUMS.txt`.

Usa **la raíz de este proyecto independiente**, no la raíz de NexoSavia. Conserva `LICENSE` y `NOTICE`. Crea el repositorio con el nombre que elijas y sube solamente estos archivos fuente. El ZIP puede adjuntarse a una entrega pública sin incluir tu directorio de trabajo entero.

Los workflows de `.github` están diseñados para que esta carpeta sea la raíz del repositorio: ejecutan `npm run check` en Linux, Windows y macOS, con Node 22/24. No requieren credenciales UP y no realizan llamadas autenticadas.

Antes de una publicación real, revisa el contenido final, las condiciones de uso aplicables a tu cuenta y los resultados de CI. Comprueba manualmente el login y al menos un curso accesible usando tu propia cuenta; no subas resultados académicos como fixtures.

## Registro npm

El paquete tiene metadatos y binario preparados, pero esta entrega **no reserva el nombre ni publica en npm**. El mantenedor debe comprobar la disponibilidad del nombre; si lo cambia, actualiza `package.json`, lockfile, ejemplos y documentación.

Después de añadir la URL del repositorio público, establecer responsables de soporte y verificar la entrega, el mantenedor puede publicar el `.tgz` con su propia cuenta npm. No se guardan tokens de publicación en el proyecto y no existe un workflow que publique automáticamente.

## Compatibilidad y versión

Las APIs y reglas de acceso institucional pueden cambiar. Incluye en cada versión una nota con sistema operativo probado, versión Node, resultado de comprobaciones y alcance de la validación real. Actualiza [VALIDATION.md](VALIDATION.md) sin incluir datos del estudiante.
