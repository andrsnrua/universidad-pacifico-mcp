import assert from 'node:assert/strict';
import { inspectPublicFiles, listSourceFiles, npm } from './package-files.mjs';

const source = listSourceFiles();
inspectPublicFiles(source);
const [manifest] = JSON.parse(npm(['pack', '--dry-run', '--json', '--ignore-scripts']));
const names = manifest.files.map(file => file.path);
inspectPublicFiles(names);
for (const file of ['dist/index.js', 'dist/mcp/server.js', 'dist/mcp/tools/index.js', 'dist/mcp/prompts.js', 'dist/mcp/resources.js', 'docs/README.md', 'docs/guide/installation.md', 'LICENSE', 'NOTICE', 'README.md', 'SECURITY.md']) {
  assert(names.includes(file), `Falta ${file} en el paquete npm.`);
}
assert(!names.some(name => name.startsWith('src/') || name.startsWith('tests/')), 'El paquete npm contiene fuentes o pruebas innecesarias.');
assert(!names.some(name => /^dist\/blackboard\/(?:tools|student-tools|participation-tools)\./.test(name)), 'El paquete contiene módulos anteriores a la reorganización.');
console.log(JSON.stringify({ sourceFiles: source.length, npmFiles: names.length, package: manifest.filename, status: 'ready' }, null, 2));
