import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { root, listSourceFiles, inspectPublicFiles, npm } from './package-files.mjs';

// Archivo ZIP estándar sin dependencias adicionales: compresión DEFLATE, CRC32
// y nombres UTF-8. Solo entran las rutas de código/documentación permitidas.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = listSourceFiles();
inspectPublicFiles(files);
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });
const chunks = [];
const directory = [];
let position = 0;
for (const relative of files) {
  const name = Buffer.from(`${pkg.name}/${relative}`);
  const body = fs.readFileSync(path.join(root, relative));
  const compressed = deflateRawSync(body);
  const crc = crc32(body);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x5821, 12); // 2024-01-01: fecha fija para archivos reproducibles
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(body.length, 22);
  header.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0x5821, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(position, 42);
  chunks.push(header, name, compressed);
  directory.push(central, name);
  position += header.length + name.length + compressed.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(position, 16);
const zipName = `${pkg.name}-${pkg.version}-source.zip`;
fs.writeFileSync(path.join(release, zipName), Buffer.concat([...chunks, central, end]));
const [packed] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', release]));
inspectPublicFiles(packed.files.map(file => file.path));
const artifacts = [zipName, packed.filename];
const checksums = artifacts.map(name => `${createHash('sha256').update(fs.readFileSync(path.join(release, name))).digest('hex')}  ${name}`).join('\n');
fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), checksums + '\n');
console.log(JSON.stringify({ directory: release, artifacts: [...artifacts, 'SHA256SUMS.txt'], sourceFiles: files.length }, null, 2));
