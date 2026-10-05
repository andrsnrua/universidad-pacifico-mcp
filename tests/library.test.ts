import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { inspectManifest, libraryPath, listMaterials, readMaterial, searchMaterials } from '../dist/library/materials.js';
function temporary(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-library-')), previous = process.env.UP_MCP_DOWNLOAD_DIR; process.env.UP_MCP_DOWNLOAD_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR; else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    const relative = path.relative(os.tmpdir(), root); if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(root, { recursive: true, force: true }); }); return root;
}
function zip(entries: Record<string, string>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(text), packed = deflateRawSync(data); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, packed); const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(8, 10); index.writeUInt32LE(crc, 16); index.writeUInt32LE(packed.length, 20); index.writeUInt32LE(data.length, 24); index.writeUInt16LE(filename.length, 28); index.writeUInt32LE(offset, 42); central.push(index, filename); offset += header.length + filename.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, directory, end]);
}
function pdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 150 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let body = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(body); body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(body);
}
test('biblioteca rechaza traversal, rutas absolutas y archivos de sesión', t => {
  temporary(t); for (const relative of ['../outside', 'a/../../outside', '/outside', 'C:/outside', '.env', 'session.json', '.private/file.txt']) assert.throws(() => libraryPath(relative));
});
test('biblioteca no sigue enlaces a archivos externos', t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'text.txt'), 'Texto ficticio');
  try { fs.symlinkSync(path.join(root, 'text.txt'), path.join(root, 'alias.txt')); } catch { t.skip('Windows sin permiso para enlaces de archivos.'); return; }
  assert.throws(() => libraryPath('alias.txt')); assert.equal(listMaterials().results.length, 1);
});
test('inventario conserva límites, tamaños y formatos sin crear carpetas', t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'a.txt'), 'abc'); fs.writeFileSync(path.join(root, 'b.exe'), 'abc');
  const data = listMaterials({ maxFiles: 1 }); assert.equal(data.results.length, 1); assert.equal(data.truncated, true); assert.equal(data.results[0].size, 3);
  assert.equal(listMaterials().results[1].readable, false);
});
test('lectura UTF-8 devuelve ventanas y no ejecuta HTML', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'text.txt'), 'Texto ficticio'); fs.writeFileSync(path.join(root, 'page.html'), '<p>Lectura</p><script>synthetic-script</script>');
  const first = await readMaterial('text.txt', { maxChars: 5 }); assert.equal(first.text, 'Texto'); assert.equal(first.nextOffset, 5); assert.equal(first.truncated, true);
  assert.equal((await readMaterial('text.txt', { offset: 6 })).text, 'ficticio'); assert(!(await readMaterial('page.html')).text.includes('synthetic-script'));
});
test('lectura rechaza binarios, formatos no admitidos y exceso de tamaño', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'binary.txt'), Buffer.from([0, 255])); fs.writeFileSync(path.join(root, 'data.exe'), 'text'); fs.writeFileSync(path.join(root, 'large.txt'), Buffer.alloc(20 * 1024 * 1024 + 1));
  await assert.rejects(readMaterial('binary.txt')); await assert.rejects(readMaterial('data.exe')); await assert.rejects(readMaterial('large.txt'), /límite/);
});
test('PDF se procesa en lector aislado con páginas y sin OCR', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'lecture.pdf'), pdf('Fictional economics lecture'));
  const data = await readMaterial('lecture.pdf'); assert(data.text.includes('Fictional economics')); assert.equal(data.totalPages, 1); assert.equal(data.startPage, 1); assert.equal(data.ocrPerformed, false);
  await assert.rejects(readMaterial('lecture.pdf', { startPage: 2 }));
});
test('Word extrae texto del documento y rechaza entidades externas', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'lecture.docx'), zip({ 'word/document.xml': '<w:document><w:p><w:t>Lectura ficticia &amp; práctica</w:t></w:p></w:document>' }));
  assert((await readMaterial('lecture.docx')).text.includes('Lectura ficticia & práctica'));
  fs.writeFileSync(path.join(root, 'bad.docx'), zip({ 'word/document.xml': '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///private">]><w:t>&y;</w:t>' })); await assert.rejects(readMaterial('bad.docx'));
});
test('el límite de tiempo termina el lector de documentos sin bloquear el servidor', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'lecture.docx'), zip({ 'word/document.xml': '<w:t>Texto ficticio</w:t>' }));
  await assert.rejects(readMaterial('lecture.docx', { timeoutMs: 1 }), /tiempo permitido/);
});
test('PowerPoint conserva orden numérico de diapositivas sin ejecutar adjuntos', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'slides.pptx'), zip({ 'ppt/slides/slide10.xml': '<a:p><a:t>Diez</a:t></a:p>', 'ppt/slides/slide2.xml': '<a:p><a:t>Dos</a:t></a:p>', 'ppt/embeddings/macro.bin': 'ignored' }));
  const data = await readMaterial('slides.pptx'); assert(data.text.indexOf('Dos') < data.text.indexOf('Diez')); assert(!data.text.includes('ignored'));
});
test('Excel resuelve cadenas y cero, conserva fórmulas sin valor y no las evalúa', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'sheet.xlsx'), zip({ 'xl/sharedStrings.xml': '<sst><si><t>Texto ficticio</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>0</v></c><c r="C1"><f>UNSAFE()</f></c></row></worksheet>' }));
  const data = await readMaterial('sheet.xlsx'); assert(data.text.includes('A1: Texto ficticio')); assert(data.text.includes('B1: 0')); assert(data.text.includes('fórmula sin valor almacenado')); assert(!data.text.includes('UNSAFE'));
});
test('Office rechaza rutas ZIP inseguras, documentos inválidos y expansiones excesivas', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'path.docx'), zip({ '../word/document.xml': '<w:t>Outside</w:t>' })); fs.writeFileSync(path.join(root, 'broken.pptx'), 'not zip'); fs.writeFileSync(path.join(root, 'bomb.docx'), zip({ 'word/document.xml': 'x'.repeat(8 * 1024 * 1024 + 1) }));
  await assert.rejects(readMaterial('path.docx')); await assert.rejects(readMaterial('broken.pptx')); await assert.rejects(readMaterial('bomb.docx'));
});
test('búsqueda local compara todos los términos sin tildes y declara cobertura limitada', async t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'a.txt'), 'Evaluación práctica ficticia'); fs.writeFileSync(path.join(root, 'b.txt'), 'Otro texto');
  const data = await searchMaterials('EVALUACION practica', { maxFiles: 1 }); assert.equal(data.results.length, 1); assert.equal(data.searched, 1); assert.equal(data.complete, false); assert.equal(data.truncated, true);
});
test('manifiesto comprueba tamaño y rechaza referencias fuera de la biblioteca', t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'lecture.txt'), 'abc'); fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 2, course: { id: '_101_1' }, complete: true, failed: [], downloaded: [{ saved: path.join(root, 'lecture.txt'), size: 4 }, { saved: '../outside.txt', size: 3 }] }));
  const data = inspectManifest('manifest.json'); assert.equal(data.counts.sizeMismatch, 1); assert.equal(data.counts.missingOrUnsafe, 1); assert.equal(data.contentHashesVerified, false); assert.equal(data.complete, false);
});
