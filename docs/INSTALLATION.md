# Instalación

## Requisitos

- Node.js 22.13.0 o posterior y npm.
- Conexión a Internet para instalar dependencias y consultar Aula Virtual.
- Una cuenta institucional que pueda entrar a `aulavirtual.up.edu.pe`.
- Un escritorio gráfico para el primer acceso o para completar MFA.
- Chrome/Edge instalado, o Chromium mediante Playwright.

No necesitas claves de OpenAI, contraseñas en variables de entorno, Python, una app NexoSavia ni un servidor remoto.

## Desde un ZIP de código

Extrae el ZIP en una carpeta propia. Abre un terminal en `universidad-pacifico-mcp`:

```sh
node --version
npm ci --ignore-scripts
npm run build
npm run doctor
npm run login
```

`npm ci` utiliza el lockfile incluido. La instalación no abre navegadores ni inicia sesión por sí sola. Si no hay un navegador compatible, ejecuta `npm run browser:install`; en Linux puede ser necesario instalar las bibliotecas del sistema requeridas por Playwright. Eso corresponde al administrador del equipo.

## Conectar con el asistente

Configura `node` como comando y la ruta **absoluta** a `dist/index.js` como argumento. Usa los ejemplos de [CLIENTS.md](CLIENTS.md). Cada cliente arranca el proceso y habla por stdin/stdout.

Si el cliente tiene un límite corto para herramientas, amplíalo para el inicio de sesión interactivo y las descargas. La guía de Codex usa 300 segundos; un curso muy grande puede exceder ese límite y necesitar descargas por adjunto.

El directorio de sesión debe ser el mismo en el comando de login y en el cliente MCP. Si cambias `UP_MCP_SESSION_DIR`, pásalo a ambos procesos.

## Desde el paquete npm local

Las entregas pueden incluir `universidad-pacifico-mcp-0.5.0.tgz`:

```sh
npm install -g ./universidad-pacifico-mcp-0.5.0.tgz --ignore-scripts
up-mcp doctor
up-mcp login
```

Si el paquete no encuentra Chrome/Edge, puedes instalar el navegador desde una copia de código con `npm run browser:install`. La disponibilidad de Node y de comandos globales depende del PATH del cliente. Usa rutas absolutas cuando sea necesario.

No se asume que el nombre del paquete ya exista en el registro npm. Los comandos `npx` contra un registro público solo corresponden después de que el mantenedor lo haya publicado.

## Verificar y cerrar sesión

```sh
npm run check
npm run logout
```

Las pruebas no requieren tu cuenta. El cierre de sesión elimina el estado del MCP local, conservando materiales descargados. Para revocar sesiones institucionales adicionales, usa las opciones oficiales del proveedor.
