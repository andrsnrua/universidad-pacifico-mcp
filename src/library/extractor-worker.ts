import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import yauzl from 'yauzl';
import { htmlToText } from '../downloads/course-materials.js';

const MAX_TEXT = 200_000, MAX_XML = 8 * 1024 * 1024, MAX_INFLATED = 32 * 1024 * 1024;
function xmlText(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML con declaraciones externas no admitido.');
  return htmlToText(xml.replace(/<\/(?:w:p|a:p|row)>/g, '\n').replace(/<(?:w:tab|w:br)\b[^>]*\/?\s*>/g, '\t'));
}
async function office(data: Buffer, extension: string) {
  const parts = new Map<string, string>(); let inflated = 0, entries = 0;
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new Error('Documento Office inválido.')); return; }
      const seen = new Set<string>();
      const fail = () => { zip.close(); reject(new Error('Archivo Office inseguro o excede los límites de lectura.')); };
      zip.on('error', fail); zip.on('end', resolve);
      zip.on('entry', entry => {
        const name = entry.fileName;
        if (++entries > 2000 || seen.has(name) || (entry.generalPurposeBitFlag & 1)) { fail(); return; }
        seen.add(name);
        const wanted = extension === 'docx' ? name === 'word/document.xml'
          : extension === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/.test(name)
          : name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
        if (!wanted) { zip.readEntry(); return; }
        if (entry.uncompressedSize > MAX_XML || inflated + entry.uncompressedSize > MAX_INFLATED || parts.size >= 101) { fail(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          stream.on('error', fail);
          stream.on('data', chunk => { bytes += chunk.length; if (bytes > MAX_XML || inflated + bytes > MAX_INFLATED) { stream.destroy(); fail(); } else chunks.push(chunk); });
          stream.on('end', () => {
            if (bytes !== entry.uncompressedSize) { fail(); return; }
            inflated += bytes; const xml = Buffer.concat(chunks).toString('utf8');
            if (/<!DOCTYPE|<!ENTITY/i.test(xml)) { fail(); return; }
            parts.set(name, xml); zip.readEntry();
          });
        });
      }); zip.readEntry();
    });
  });
  const names = [...parts.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!names.length || (extension === 'docx' && !parts.has('word/document.xml'))) throw new Error('No se encontró texto del formato solicitado.');
  let text: string;
  if (extension === 'xlsx') {
    const shared = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => xmlText(match[1]));
    text = names.filter(name => name.includes('/worksheets/')).map(name => {
      const cells = [...parts.get(name)!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(match => {
        const reference = match[1].match(/\br="([A-Z]+\d+)"/)?.[1] ?? '?';
        const type = match[1].match(/\bt="([^"]+)"/)?.[1], value = match[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const displayed = type === 's' ? shared[Number(value)] ?? '[cadena no disponible]' : type === 'inlineStr' ? xmlText(match[2])
          : value !== undefined ? xmlText(value) : /<f\b/.test(match[2]) ? '[fórmula sin valor almacenado]' : '';
        return `${reference}: ${displayed}`;
      });
      return `Hoja XML ${name}\n${cells.join('\n')}`;
    }).join('\n\n');
  } else text = names.map(name => extension === 'pptx' ? `${name}\n${xmlText(parts.get(name)!)}` : xmlText(parts.get(name)!)).join('\n\n');
  return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT, format: extension, extractedParts: names.length,
    note: extension === 'xlsx' ? 'Celdas y valores almacenados; no ejecuta fórmulas ni reproduce formato o nombres de hojas.' : 'Texto principal; no incluye imágenes, audio, notas ni disposición visual.' };
}
async function extract() {
  const { extension, startPage, maxPages } = workerData; const data = Buffer.from(workerData.data);
  if (extension === 'pdf') {
    // CommonJS server, ESM PDF.js. The module name is fixed and never comes from a document.
    const importModule = new Function('url', 'return import(url)') as (url: string) => Promise<any>;
    const pdfjs = await importModule(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const task = pdfjs.getDocument({ data: new Uint8Array(data), useWorkerFetch: false, disableFontFace: true,
      disableAutoFetch: true, disableStream: true, enableXfa: false, isEvalSupported: false, verbosity: 0 });
    const document = await task.promise;
    try {
      if (startPage > document.numPages) throw new Error('La página inicial excede el documento.');
      const endPage = Math.min(document.numPages, startPage + maxPages - 1); let text = '', truncated = false, pagesRead = 0;
      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
        const page = await document.getPage(pageNumber), content = await page.getTextContent();
        const pageText = content.items.map((item: any) => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
        text += `\n[ Página ${pageNumber} ]\n${pageText}`; pagesRead++; page.cleanup();
        if (text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT); truncated = true; break; }
      }
      return { text, format: 'pdf', totalPages: document.numPages, startPage, endPage: startPage + pagesRead - 1, pagesRead,
        truncated: truncated || startPage > 1 || startPage + pagesRead - 1 < document.numPages, ocrPerformed: false,
        note: 'Solo capa de texto de las páginas seleccionadas; un PDF escaneado puede requerir OCR. No ejecuta JavaScript ni sigue enlaces.' };
    } finally { await task.destroy(); }
  }
  return office(data, extension);
}
if (parentPort) extract().then(result => parentPort!.postMessage({ result })).catch(() =>
  parentPort!.postMessage({ error: 'No se pudo extraer texto: documento inválido, protegido o fuera de los límites admitidos.' }));
