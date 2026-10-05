import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceRoots = ['src', 'tests', 'docs', 'examples', 'scripts', '.github'];
export const sourceFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', '.gitignore', '.gitattributes', '.env.example'];

export function npm(args) {
  if (!process.env.npm_execpath) throw new Error('Ejecuta este script mediante npm run.');
  return execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

export function listSourceFiles() {
  const files = [...sourceFiles];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`No se empaquetan enlaces: ${relative}`);
      if (entry.isDirectory()) walk(relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  sourceRoots.forEach(walk);
  return files.sort();
}

export function inspectPublicFiles(files) {
  for (const relative of files) {
    const normalized = relative.replaceAll('\\', '/');
    if (/(^|\/)(node_modules|browser-profile|release|\.git|\.upacifico-mcp)(\/|$)|^downloads(\/|$)/i.test(normalized)
      || /(^|\/)(session\.json|sso-state\.bin|\.env)$|\.(db|sqlite|bin|enc|part|log|zip|tgz)$/i.test(normalized)) {
      throw new Error(`Archivo privado o generado en el paquete: ${relative}`);
    }
    if (/(^|\/)(agenda|notas|asistencia|estructura|resumen|comprobantes)-(?:_\d+_\d+|seleccion)-\d+-[0-9a-f]{8}\.(ics|csv|json|md)$/i.test(normalized)) {
      throw new Error(`Exportación académica privada en el paquete: ${relative}`);
    }
    const body = fs.readFileSync(path.join(root, relative), 'utf8');
    const personalPath = /(?:C:[\\/](?:Users|Usuarios)[\\/](?!Public[\\/])|\/Users\/|\/home\/)[a-z0-9._-]+[\\/]/i;
    if (personalPath.test(body)) throw new Error(`Ruta personal en ${relative}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|github_pat|sk-proj)_[A-Za-z0-9]{20,}/.test(body)) {
      throw new Error(`Posible secreto en ${relative}`);
    }
    if (/"(?:BbRouter|JSESSIONID|ESTSAUTH)"\s*:\s*"[^"\n]{30,}"/.test(body)) throw new Error(`Posible sesión en ${relative}`);
  }
}
