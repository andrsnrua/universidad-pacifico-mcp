# Configuración

[Índice de documentación](../README.md)

El servidor lee variables del entorno del proceso. **No carga `.env` automáticamente.** `.env.example` documenta las opciones y no debe contener valores reales.

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `UP_MCP_SESSION_DIR` | `~/.upacifico-mcp` | Directorio privado para sesión y perfil del navegador. |
| `UP_MCP_DOWNLOAD_DIR` | `~/Downloads/upacifico-mcp` | Raíz de materiales descargados. |
| `UP_MCP_MAX_FILE_BYTES` | 104857600 (100 MiB) | Límite por archivo descargado; máximo configurable 2 GiB. |
| `UP_MCP_MAX_TOTAL_BYTES` | 524288000 (500 MiB) | Cuota de archivos descargados dentro de la raíz; máximo configurable 50 GiB. |
| `UP_MCP_REMEMBER_SSO` | Desactivado | `1` permite conservar/restaurar estado Microsoft adicional. |
| `UP_MCP_SECRET_KEY` | Ninguna | Clave privada, mínimo 16 caracteres, para sellar SSO adicional en macOS/Linux. |

Los límites por archivo y cuota solo aceptan enteros válidos iguales o mayores al valor predeterminado; valores inválidos vuelven al predeterminado. Se contabilizan archivos existentes para la cuota de descargas. Los documentos Markdown y el manifiesto generados no pasan por esa misma cuota: no se presenta como límite total de uso del disco.

Usa rutas absolutas para que el proceso de login y el cliente compartan el mismo estado. Las rutas relativas se resuelven respecto al directorio de trabajo del proceso. No uses carpetas públicas, compartidas o sincronizadas para sesiones.

## Ejemplo en PowerShell

```powershell
$env:UP_MCP_SESSION_DIR = 'C:/DatosPrivados/up-mcp/session'
$env:UP_MCP_DOWNLOAD_DIR = 'C:/DatosPrivados/up-mcp/materiales'
npm run login
```

Pasa esos mismos valores al campo `env` de tu cliente. No basta con declararlos en un terminal si el cliente se inició antes o tiene otro entorno.

## Ejemplo en macOS/Linux

```sh
export UP_MCP_SESSION_DIR=/ruta/privada/up-mcp/session
export UP_MCP_DOWNLOAD_DIR=/ruta/privada/up-mcp/materiales
npm run login
```

Para recordar SSO adicional en un equipo personal, genera una clave aleatoria y privada de al menos 32 bytes de entropía y pásala por el entorno; no la pongas en ejemplos públicos. Sin clave en macOS/Linux, ese estado adicional no se guarda. El perfil Chromium sigue siendo sensible aunque no se active esta opción.

## Opciones de herramientas

`outputDir` es una subcarpeta **relativa** dentro de la raíz de descargas; no es una ruta arbitraria. Para una descarga de curso se añade la carpeta del curso. Los IDs y fechas se validan antes de consultar Blackboard. No existe una variable para redirigir este paquete a otra universidad.
