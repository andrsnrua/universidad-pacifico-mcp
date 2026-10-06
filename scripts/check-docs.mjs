import fs from 'node:fs';
import path from 'node:path';
import { root, listSourceFiles } from './package-files.mjs';

const documents = listSourceFiles().filter(file => file.endsWith('.md'));
const errors = [];
let links = 0;
for (const file of documents) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/```[^\n]*\n[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const absolute = path.resolve(root, path.dirname(file), decodeURIComponent(target.split('#')[0]));
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) errors.push(`${file}: enlace inexistente o fuera del proyecto: ${target}`);
    links++;
  }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ documents: documents.length, localLinks: links, status: 'passed' }));
