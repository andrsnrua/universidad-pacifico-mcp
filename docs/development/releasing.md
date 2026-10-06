# Publicar una versión

[Índice de documentación](../README.md)

El código se mantiene en [universidad-pacifico-mcp](https://github.com/andrsnrua/universidad-pacifico-mcp) y las descargas en [GitHub Releases](https://github.com/andrsnrua/universidad-pacifico-mcp/releases).

## Preparar los archivos

Actualiza la versión en `package.json`, el lockfile y `CHANGELOG.md`. Desde la raíz del repositorio:

```sh
npm ci --ignore-scripts
npm run share
```

`share` ejecuta todas las comprobaciones y genera en `release/`:

| Archivo para 0.6.0 | Contenido |
| --- | --- |
| `universidad-pacifico-mcp-0.6.0-source.zip` | Código, pruebas, documentación, ejemplos y CI. |
| `universidad-pacifico-mcp-0.6.0.tgz` | Runtime compilado, documentación y licencia. |
| `SHA256SUMS.txt` | Hash SHA-256 de ambos paquetes. |

El ZIP contiene una carpeta `universidad-pacifico-mcp`; después de extraerla, instala con `npm ci --ignore-scripts`. El `.tgz` se puede instalar como paquete local, según la [guía de instalación](../guide/installation.md).

## Comprobar y publicar

1. Revisa el contenido del ZIP y del paquete compilado. Conserva `LICENSE` y `NOTICE`.
2. Confirma que las seis combinaciones de CI del commit elegido estén aprobadas.
3. Crea la etiqueta de versión y la release sobre ese commit; adjunta los dos paquetes y sus hashes.
4. Describe los cambios y el alcance de validación sin incluir resultados académicos ni credenciales.

El empaquetado admite exclusivamente rutas de código, pruebas, documentación y configuración de ejemplo. Excluye dependencias instaladas, salidas de compilación del ZIP, sesiones, perfiles, descargas, `.env` real y archivos personales. La detección de patrones de secretos complementa la selección de archivos.

## Registro npm

El proyecto distribuye el `.tgz` en GitHub. No se debe usar un comando de instalación desde el registro npm hasta que el paquete haya sido publicado allí. Una publicación en npm requiere verificar el nombre y usar la cuenta del mantenedor; los tokens no se guardan en este repositorio.
