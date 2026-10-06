import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { root } from './package-files.mjs';

const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root || (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) {
  throw new Error('La salida de compilación debe ser una carpeta propia del proyecto.');
}
fs.rmSync(output, { recursive: true, force: true });
const require = createRequire(path.join(root, 'package.json'));
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
