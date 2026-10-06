# Conexión con clientes MCP

[Índice de documentación](../README.md)

## Comando común

Primero instala dependencias y compila. Luego usa como proceso MCP:

```sh
node /ruta/absoluta/universidad-pacifico-mcp/dist/index.js
```

El argumento `mcp` es opcional. Se arranca sin sesión; el asistente puede llamar después a `blackboard_login`. No uses `npm start` como comando stdio: npm puede escribir encabezados que no pertenecen al protocolo.

## Codex

La [documentación oficial de OpenAI para MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) describe `command`, `args`, `env`, `cwd` y límites de herramientas. Configuración orientativa, con rutas que debes reemplazar:

```toml
[mcp_servers.universidad_pacifico]
command = "node"
args = ["C:/Proyectos/universidad-pacifico-mcp/dist/index.js"]
startup_timeout_sec = 20
tool_timeout_sec = 300

[mcp_servers.universidad_pacifico.env]
UP_MCP_REMEMBER_SSO = "0"
```

Guárdala en la configuración MCP apropiada del cliente; Codex admite configuración de usuario en `~/.codex/config.toml` y de proyecto en `.codex/config.toml` para proyectos de confianza. No reemplaces toda tu configuración existente: añade únicamente esta tabla con un nombre que no esté usado.

Para la CLI también puedes registrar el proceso con:

```sh
codex mcp add universidad-pacifico -- node /ruta/absoluta/universidad-pacifico-mcp/dist/index.js
codex mcp list
```

El acceso institucional se realiza con `blackboard_login` o `up-mcp login`; este servidor no implementa un flujo OAuth de cliente MCP. Sigue la configuración de tiempos del ejemplo si necesitas esperar al navegador.

## Clientes con mcpServers

Usa [mcp.json](../../examples/mcp.json) o [mcp.windows.json](../../examples/mcp.windows.json). Su ubicación depende del cliente. Estos archivos usan el objeto `mcpServers`; otros clientes pueden requerir un envoltorio diferente, aunque el comando y los argumentos sean los mismos.

```json
{
  "mcpServers": {
    "universidad-pacifico": {
      "command": "node",
      "args": ["C:/Proyectos/universidad-pacifico-mcp/dist/index.js"],
      "env": { "UP_MCP_REMEMBER_SSO": "0" }
    }
  }
}
```

## Comprobación

Después de reiniciar o reconectar el cliente, debe mostrar el servidor `universidad-pacifico-mcp` y sus 70 herramientas `blackboard_*`. Consulta primero `blackboard_whoami`, autentica cuando sea necesario y lista tus cursos.

Recursos y prompts pueden aparecer en un panel diferente o no tener interfaz en algunos clientes. Las herramientas siguen disponibles independientemente de ello.

Este proyecto distribuye un MCP local stdio. No proporciona una URL pública que puedas pegar en un cliente que solo acepte servidores HTTP remotos.
