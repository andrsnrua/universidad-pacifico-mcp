#!/usr/bin/env node
import { startMcpServer } from './mcp/server.js';
import { BLACKBOARD_BASE_URL, PROFILE_DIR, SESSION_DIR } from './blackboard/config.js';
import { clearReloginCooldown, clearSession, loadSession } from './blackboard/auth/session.js';
import { clearSsoState } from './blackboard/auth/sso-state.js';
import { login } from './blackboard/auth/login.js';
import { downloadRoot } from './security/files.js';
import fs from 'node:fs';

const { version } = require('../package.json') as { version: string };
const help = `Universidad del Pacífico MCP ${version} — integración comunitaria no oficial

up-mcp             Inicia MCP por stdio (también: up-mcp mcp)
up-mcp login       Abre el navegador para el acceso institucional
up-mcp logout      Borra la sesión y el perfil local de este MCP
up-mcp doctor      Muestra configuración y estado local, sin contactar la UP
up-mcp --version   Muestra la versión

No se aceptan contraseñas ni nombres de usuario por línea de comandos.
Instalación desde el código: npm ci --ignore-scripts && npm run build
`;

async function main(): Promise<void> {
  const [command = 'mcp', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Argumentos adicionales no admitidos. Usa up-mcp --help.');
  switch (command) {
    case 'mcp': await startMcpServer(); break;
    case 'login': {
      clearReloginCooldown();
      const session = await login({ headless: false });
      console.log(JSON.stringify({ authenticated: true, userId: session.userId, userName: session.userName }, null, 2));
      break;
    }
    case 'logout':
      clearSession();
      clearSsoState();
      clearReloginCooldown();
      console.log('Sesión y perfil local eliminados.');
      break;
    case 'doctor': {
      const session = loadSession();
      console.log(JSON.stringify({
        name: 'universidad-pacifico-mcp', version, node: process.version,
        platform: process.platform, transport: 'stdio', university: 'Universidad del Pacífico (Perú)',
        baseUrl: BLACKBOARD_BASE_URL, sessionDirectory: SESSION_DIR,
        downloadDirectory: downloadRoot(), browserProfileExists: fs.existsSync(PROFILE_DIR),
        localSessionPresent: Boolean(session),
        localSessionExpiresAt: session?.expiresAt ? new Date(session.expiresAt).toISOString() : null,
        rememberSso: process.env.UP_MCP_REMEMBER_SSO === '1',
        ssoEncryptionAvailable: process.platform === 'win32' || Boolean(process.env.UP_MCP_SECRET_KEY?.trim()),
      }, null, 2));
      break;
    }
    case '--version': case '-v': console.log(version); break;
    case '--help': case '-h': console.log(help); break;
    default: throw new Error(`Comando desconocido: ${command}. Usa up-mcp --help.`);
  }
}

main().catch(() => {
  // Errores Axios pueden contener URL firmadas y objetos de sesión. Los detalles
  // del transporte no se vuelcan al protocolo ni a registros públicos.
  console.error('No se pudo completar la operación. Revisa la configuración con up-mcp doctor y la guía docs/guide/troubleshooting.md.');
  process.exitCode = 1;
});
