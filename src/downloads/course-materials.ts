import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import { BLACKBOARD_BASE_URL, BLACKBOARD_HOST } from '../blackboard/config.js';
import { getCourse, getContent } from '../blackboard/api/courses.js';
import { readAllPages } from '../blackboard/api/pagination.js';
import { listAssignments } from '../blackboard/api/assignments.js';
import { assertBlackboardFileUrl } from '../blackboard/api/client.js';
import { downloadRoot, resolveDownloadDir, safeNewFilePath, writeNamedDownload } from '../security/files.js';

type CourseItem = {
  id: string;
  title?: string;
  body?: string;
  hasChildren?: boolean;
  contentHandler?: { id?: string; url?: string; instructions?: string };
};

type DownloadRecord = {
  contentId: string;
  contentTitle: string;
  // 'activity' es el enunciado de una actividad del boletín de notas, no un archivo del árbol.
  source: 'attachment' | 'embedded' | 'page' | 'activity';
  sourceId?: string;
  sourceKey?: string;
  remoteFingerprint?: string;
  fileName: string;
  saved?: string;
  size?: number;
  state?: 'downloaded' | 'unchanged';
  error?: string;
};

type CourseManifest = {
  schemaVersion?: number;
  generatedAt?: string;
  course?: { id?: string };
  downloaded?: DownloadRecord[];
};

function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function uniqueFilename(directory: string, requested: string): string {
  const safe = path.basename(requested) || 'archivo';
  const parsed = path.parse(safe);
  let candidate = safe;
  let index = 2;
  while (fs.existsSync(safeNewFilePath(directory, candidate))) {
    candidate = `${parsed.name} (${index++})${parsed.ext}`;
  }
  return candidate;
}

export function configuredByteLimit(name: string, fallback: number, maximum: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isSafeInteger(parsed) || parsed < fallback) return fallback;
  return Math.min(parsed, maximum);
}

export function sourceKey(source: DownloadRecord['source'], contentId: string, sourceId: string): string {
  return `${source}:${contentId}:${sourceId}`;
}

export function latestCourseManifest(directory: string, courseId: string): CourseManifest | undefined {
  if (!fs.existsSync(directory)) return undefined;
  let latest: CourseManifest | undefined;
  let latestTime = 0;
  for (const name of fs.readdirSync(directory)) {
    if (!/^manifest(?: \(\d+\))?\.json$/i.test(name)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as CourseManifest;
      if (parsed.course?.id !== courseId) continue;
      const timestamp = Date.parse(parsed.generatedAt ?? '') || fs.statSync(path.join(directory, name)).mtimeMs;
      if (!latest || timestamp > latestTime) {
        latest = parsed;
        latestTime = timestamp;
      }
    } catch {}
  }
  return latest;
}

export function atomicManifestWrite(destination: string, value: unknown): void {
  const temporary = `${destination}.${process.pid}.${Date.now()}.next`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, destination);
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Below this, a page body is a heading or a stray tag, not instructions worth a file. */
const MINIMUM_PAGE_TEXT = 80;
// Un enunciado corto («Suban el PDF aquí») sigue siendo el enunciado, así que el listón baja.
const MINIMUM_ACTIVITY_TEXT = 12;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  iquest: '¿', iexcl: '¡', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', deg: '°', euro: '€', middot: '·',
};

/**
 * Decodes the entities a rich-text editor produces.
 *
 * Blackboard writes accents as decimal (`&#225;`) *and* hexadecimal (`&#xe1;`) references
 * depending on how the text was pasted. Handling only decimals left `gr&#xe1;ficos` sitting in
 * the saved file, which is worse than the tag it replaced.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name] ?? match);
}

/**
 * Turns a Blackboard page body into readable text.
 *
 * Blackboard pages are HTML written in a rich-text editor: tables of criteria, bulleted lists of
 * deliverables, links to readings. Stripping tags blindly runs every sentence together, so block
 * elements become line breaks and list items keep their bullet.
 *
 * Blocks are separated by exactly one blank line regardless of how the source was formatted: the
 * first version let stray newlines in the HTML decide, so two identical pages could come out
 * spaced differently.
 */
export function htmlToText(html: string): string {
  const text = decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|tr|h[1-6]|ul|ol|table|blockquote)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<t[dh]\b[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  );
  return text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // A bullet never needs a blank line above it; the list already reads as one block.
    .replace(/\n\n(?=- )/g, '\n')
    .trim();
}

function transientBlackboardError(error: any): boolean {
  const status = error?.response?.status;
  return ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)
    || status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
}

async function withBlackboardRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!transientBlackboardError(error) || attempt === attempts - 1) throw error;
      const delay = Math.min(8_000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function assertTrustedBlackboardCdnUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL de CDN inválida: ${value}`);
  }
  if (
    parsed.protocol !== 'https:'
    || !/^alt-[a-z0-9-]+\.blackboard\.com$/i.test(parsed.hostname)
    || parsed.username
    || parsed.password
  ) {
    throw new Error(`Redirección de descarga no autorizada: ${parsed.hostname}`);
  }
  return parsed;
}

export function embeddedFiles(body = ''): Array<{ fileName: string; url: string }> {
  const found: Array<{ fileName: string; url: string }> = [];
  const seen = new Set<string>();
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of body.matchAll(anchors)) {
    const url = htmlDecode(match[1]);
    if (!url.includes('/bbcswebdav/')) continue;
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    let fileName = text || 'archivo';
    const metadata = match[0].match(/data-bbfile=["']([^"']+)["']/i)?.[1];
    if (metadata) {
      try {
        const parsed = JSON.parse(htmlDecode(metadata));
        fileName = parsed.displayName ?? parsed.linkName ?? fileName;
      } catch {}
    }
    if (!seen.has(url)) {
      seen.add(url);
      found.push({ fileName, url });
    }
  }
  return found;
}

export async function allContents(client: AxiosInstance, courseId: string, parentId?: string): Promise<CourseItem[]> {
  const endpoint = parentId
    ? `/learn/api/public/v1/courses/${courseId}/contents/${parentId}/children`
    : `/learn/api/public/v1/courses/${courseId}/contents`;
  return (await withBlackboardRetry(() => readAllPages<CourseItem>(client, endpoint, {
    fields: 'id,parentId,title,body,position,hasChildren,contentHandler',
  }))).results;
}

const ATTACHMENT_CONTENT_HANDLERS = new Set([
  'resource/x-bb-file', 'resource/x-bb-document', 'resource/x-bb-assignment',
]);

export async function attachmentList(client: AxiosInstance, courseId: string, contentId: string, content?: Pick<CourseItem, 'contentHandler'>) {
  // The public attachment API does not apply to folders, links or Ultra
  // assessments. Their published text and embedded files are read separately.
  const handler = content?.contentHandler?.id;
  if (handler && !ATTACHMENT_CONTENT_HANDLERS.has(handler)) return [];
  return (await withBlackboardRetry(() => readAllPages<{ id: string; fileName?: string; mimeType?: string }>(
    client, `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments`,
  ))).results;
}

export async function downloadStream(
  client: AxiosInstance,
  url: string,
  directory: string,
  requestedName: string,
) {
  const requestedPath = safeNewFilePath(directory, requestedName || 'archivo');
  if (fs.existsSync(requestedPath) && fs.lstatSync(requestedPath).isFile()) {
    return {
      fileName: path.basename(requestedPath),
      destination: requestedPath,
      size: fs.statSync(requestedPath).size,
      existing: true,
    };
  }
  let currentUrl = new URL(url, BLACKBOARD_BASE_URL);
  let cdnHost: string | undefined;
  let response: any;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    if (currentUrl.host === BLACKBOARD_HOST && !cdnHost) {
      response = await client.get(currentUrl.toString(), {
        responseType: 'stream',
        headers: { Accept: '*/*' },
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
      });
    } else {
      const trusted = assertTrustedBlackboardCdnUrl(currentUrl.toString());
      cdnHost ??= trusted.host;
      if (trusted.host !== cdnHost) {
        throw new Error(`El CDN intentó redirigir a otro host: ${trusted.hostname}`);
      }
      response = await axios.get(trusted.toString(), {
        timeout: 30_000,
        responseType: 'stream',
        headers: { Accept: '*/*' },
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
      });
    }

    if (response.status < 300 || response.status >= 400) break;
    response.data?.destroy?.();
    const location = response.headers.location as string | undefined;
    if (!location) throw new Error(`Blackboard devolvió ${response.status} sin destino de descarga`);
    currentUrl = new URL(location, currentUrl);
    if (currentUrl.host !== BLACKBOARD_HOST) {
      const trusted = assertTrustedBlackboardCdnUrl(currentUrl.toString());
      cdnHost ??= trusted.host;
    }
    if (redirectCount === 5) throw new Error('La descarga excedió 5 redirecciones');
  }
  const disposition = response.headers['content-disposition'] as string | undefined;
  const detected = disposition
    ?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1]
    ?.replace(/['"]/g, '')
    .trim();
  const fileName = uniqueFilename(directory, detected || requestedName || 'archivo');
  return {
    fileName,
    ...(await writeNamedDownload(
      response.data,
      directory,
      fileName,
      configuredByteLimit('UP_MCP_MAX_FILE_BYTES', 100 * 1024 * 1024, 2 * 1024 * 1024 * 1024),
      { root: downloadRoot(), maxBytes: configuredByteLimit('UP_MCP_MAX_TOTAL_BYTES', 500 * 1024 * 1024, 50 * 1024 * 1024 * 1024) },
    )),
    existing: false,
  };
}

/**
 * Lo que el profesor pide en una actividad, en un archivo.
 *
 * Las actividades se leen del boletín de notas y los archivos del árbol de contenidos, y las dos
 * mitades nunca se juntaron: la aplicación sabía que existía "Entrega 1" y cuándo vencía, pero no
 * qué pedía ni qué archivos venían dentro. El enunciado vive en `description` de la columna, que no
 * se guardaba en ninguna parte, así que no se podía leer sin conexión, ni buscar, ni mandarlo a
 * el asistente. Esto lo convierte en un documento junto a los adjuntos de esa misma actividad.
 */
export function activityDocument(column: {
  name?: string;
  description?: string;
  grading?: { due?: string; type?: string; attemptsAllowed?: number };
  score?: { possible?: number };
}): string {
  const title = (column.name ?? 'Actividad sin nombre').trim();
  const lines = [`# ${title}`, ''];
  const facts: string[] = [];
  if (column.grading?.due) {
    const due = new Date(column.grading.due);
    if (!Number.isNaN(due.getTime())) facts.push(`- Fecha de entrega (Lima): ${due.toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Lima' })}`);
  }
  if (typeof column.score?.possible === 'number') facts.push(`- Puntaje: ${column.score.possible} puntos`);
  if (typeof column.grading?.attemptsAllowed === 'number') facts.push(`- Intentos permitidos: ${column.grading.attemptsAllowed}`);
  if (facts.length) lines.push(...facts, '');
  const body = htmlToText(column.description ?? '');
  lines.push(body || 'No se recibieron indicaciones de la actividad en esta consulta.', '');
  return lines.join('\n');
}

/** ¿Merece la pena guardar este documento, o sólo repite el título? */
export function activityWorthSaving(description: string | undefined, attachmentCount = 0): boolean {
  return attachmentCount > 0 || htmlToText(description ?? '').length >= MINIMUM_ACTIVITY_TEXT;
}

/**
 * Los enlaces que el profesor dejó y que no son archivos.
 *
 * Se anotaban como "omitido" en el manifiesto y ahí se quedaban: para el estudiante, material que
 * simplemente no existía. Entre ellos hay cosas como "Entregue aquí las actividades en clase y el
 * proyecto de investigación". No se pueden descargar, pero sí se pueden dejar por escrito.
 */
export function externalLinksDocument(
  courseName: string,
  links: Array<{ title: string; url?: string }>,
): string {
  const lines = [`# Enlaces de ${courseName}`, '',
    'Estos materiales viven fuera de Aula Virtual, así que no se pueden descargar. Quedan aquí para que no se pierdan.', ''];
  for (const link of links) {
    if (!link.url) continue;
    lines.push(`- [${link.title}](${link.url})`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function downloadWholeCourse(
  client: AxiosInstance,
  courseId: string,
  outputDir?: string,
  options: {
    /**
     * The course folder itself, relative to the download root.
     *
     * `outputDir` names a *parent* and the course name is appended to it, which is right for the
     * MCP tool ("put this course under 2026-2/"). The desktop app was passing the course folder
     * there, so every course ended up at `<course>/<course>/…` — one redundant level per course,
     * and paths past 400 characters on Windows. Callers that already know the folder pass it here
     * and nothing is appended.
     */
    courseDirectory?: string;
  } = {},
) {
  const course = await withBlackboardRetry(() => getCourse(client, courseId));
  // El nombre no identifica una sección: siempre conserva el ID fuera del
  // título truncado para separar incluso cursos con nombres iguales o largos.
  const rootName = `${safeSegment(course.name ?? course.courseId ?? 'Curso', 'Curso').slice(0, 90)} [${safeSegment(courseId, 'curso')}]`;
  const base = resolveDownloadDir(
    options.courseDirectory
      ? options.courseDirectory
      : outputDir ? path.join(outputDir, rootName) : rootName,
  );
  // macOS exposes /var through /private/var. Compare paths in one canonical
  // coordinate system after resolveDownloadDir has rejected unsafe roots.
  const canonicalRoot = fs.realpathSync(downloadRoot());
  const previous = latestCourseManifest(base, courseId);
  const previousByKey = new Map((previous?.downloaded ?? []).filter(record => record.sourceKey).map(record => [record.sourceKey!, record]));
  const previousLegacy = new Map((previous?.downloaded ?? []).map(record => [`${record.source}:${record.contentId}:${record.fileName}`, record]));
  const downloaded: DownloadRecord[] = [];
  const changed: DownloadRecord[] = [];
  const failed: DownloadRecord[] = [];
  const skipped: Array<{ contentId: string; title: string; reason: string; url?: string }> = [];
  let itemCount = 0;
  const seenKeys = new Set<string>();
  // Una actividad suele estar además en el árbol; sin esto sus adjuntos caerían dos veces.
  const visitedContentIds = new Set<string>();
  let enumerationIncomplete = false;

  const reusePrevious = (key: string, legacyKey: string, fingerprint: string): DownloadRecord | undefined => {
    const candidate = previousByKey.get(key) ?? previousLegacy.get(legacyKey);
    if (!candidate?.saved || !fs.existsSync(candidate.saved) || !fs.lstatSync(candidate.saved).isFile()) return undefined;
    if (candidate.remoteFingerprint && candidate.remoteFingerprint !== fingerprint) return undefined;
    return { ...candidate, sourceKey: key, remoteFingerprint: fingerprint, size: fs.statSync(candidate.saved).size, state: 'unchanged' };
  };

  const visit = async (parentId: string | undefined, relativeParts: string[], depth: number): Promise<void> => {
    if (depth > 30) {
      enumerationIncomplete = true;
      failed.push({ contentId: parentId ?? courseId, contentTitle: 'Límite de profundidad', source: 'page', fileName: '', error: 'El árbol del curso excede 30 niveles.' });
      return;
    }
    let items: CourseItem[];
    try {
      items = await allContents(client, courseId, parentId);
    } catch (error: any) {
      enumerationIncomplete = true;
      failed.push({
        contentId: parentId ?? courseId,
        contentTitle: parentId ? 'Carpeta no disponible temporalmente' : 'Raíz del curso no disponible temporalmente',
        source: 'attachment',
        fileName: '',
        error: `No se pudo enumerar contenido: ${error.code || error.message}`,
      });
      return;
    }
    for (const item of items) {
      if (visitedContentIds.has(String(item.id))) continue;
      itemCount += 1;
      const title = item.title ?? item.id;
      visitedContentIds.add(String(item.id));
      const itemDir = resolveDownloadDir(path.relative(canonicalRoot, path.join(base, ...relativeParts)));
      let attachments: Awaited<ReturnType<typeof attachmentList>> = [];
      try {
        attachments = await attachmentList(client, courseId, item.id, item);
      } catch (error: any) {
        enumerationIncomplete = true;
        failed.push({
          contentId: item.id,
          contentTitle: title,
          source: 'attachment',
          fileName: '',
          error: `No se pudo enumerar adjuntos: ${error.message}`,
        });
      }

      for (const attachment of attachments) {
        const fileName = attachment.fileName ?? `${item.id}-${attachment.id}`;
        const key = sourceKey('attachment', item.id, attachment.id);
        const fingerprint = `${attachment.id}:${fileName}:${attachment.mimeType ?? ''}`;
        seenKeys.add(key);
        try {
          const reused = reusePrevious(key, `attachment:${item.id}:${fileName}`, fingerprint);
          if (reused) {
            downloaded.push(reused);
            continue;
          }
          const requestedName = fs.existsSync(safeNewFilePath(itemDir, fileName)) ? uniqueFilename(itemDir, fileName) : fileName;
          const result = await downloadStream(
            client,
            `/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments/${attachment.id}/download`,
            itemDir,
            requestedName,
          );
          const record: DownloadRecord = {
            contentId: item.id,
            contentTitle: title,
            source: 'attachment',
            sourceId: attachment.id,
            sourceKey: key,
            remoteFingerprint: fingerprint,
            fileName: result.fileName,
            saved: result.destination,
            size: result.size,
            state: 'downloaded',
          };
          downloaded.push(record);
          changed.push(record);
        } catch (error: any) {
          failed.push({ contentId: item.id, contentTitle: title, source: 'attachment', sourceId: attachment.id, sourceKey: key, remoteFingerprint: fingerprint, fileName, error: error.message });
        }
      }

      const itemInstructions = [item.body, item.contentHandler?.instructions].filter(value => typeof value === 'string').join('\n\n');
      for (const embedded of embeddedFiles(itemInstructions)) {
        const embeddedUrl = new URL(embedded.url, BLACKBOARD_BASE_URL);
        const embeddedId = embeddedUrl.pathname;
        const key = sourceKey('embedded', item.id, embeddedId);
        const fingerprint = `${embeddedId}:${embedded.fileName}`;
        seenKeys.add(key);
        try {
          assertBlackboardFileUrl(embedded.url);
          const reused = reusePrevious(key, `embedded:${item.id}:${embedded.fileName}`, fingerprint);
          if (reused) {
            downloaded.push(reused);
            continue;
          }
          const requestedName = fs.existsSync(safeNewFilePath(itemDir, embedded.fileName)) ? uniqueFilename(itemDir, embedded.fileName) : embedded.fileName;
          const result = await downloadStream(client, embedded.url, itemDir, requestedName);
          const record: DownloadRecord = {
            contentId: item.id,
            contentTitle: title,
            source: 'embedded',
            sourceId: embeddedId,
            sourceKey: key,
            remoteFingerprint: fingerprint,
            fileName: result.fileName,
            saved: result.destination,
            size: result.size,
            state: 'downloaded',
          };
          downloaded.push(record);
          changed.push(record);
        } catch (error: any) {
          failed.push({
            contentId: item.id,
            contentTitle: title,
            source: 'embedded',
            sourceId: embeddedId,
            sourceKey: key,
            remoteFingerprint: fingerprint,
            fileName: embedded.fileName,
            error: error.message,
          });
        }
      }

      // What the lecturer actually wrote on the page.
      //
      // `item.body` was read only to harvest links out of it and then discarded, so instructions
      // that live on a Blackboard page rather than inside an attachment — what to hand in, the
      // length limit, the marking criteria — existed nowhere on the student's machine and could
      // not be searched. Saved as Markdown beside that page's files.
      const pageText = htmlToText(itemInstructions);
      if (pageText.length >= MINIMUM_PAGE_TEXT) {
        try {
          const fileName = `${safeSegment(title, item.id)} [${item.id}] - indicaciones.md`;
          const destination = safeNewFilePath(itemDir, fileName);
          const document = [`# ${title}`, '', pageText, ''].join('\n');
          const previousPage = reusePrevious(
            sourceKey('page', item.id, 'body'),
            `page:${item.id}:${fileName}`,
            crypto.createHash('sha256').update(document).digest('hex'),
          );
          if (!previousPage) {
            fs.mkdirSync(itemDir, { recursive: true });
            const temporary = `${destination}.${process.pid}.next`;
            fs.writeFileSync(temporary, document, { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(temporary, destination);
          }
          const record: DownloadRecord = {
            contentId: item.id,
            contentTitle: title,
            source: 'page',
            sourceId: 'body',
            sourceKey: sourceKey('page', item.id, 'body'),
            remoteFingerprint: crypto.createHash('sha256').update(document).digest('hex'),
            fileName,
            saved: destination,
            size: Buffer.byteLength(document, 'utf8'),
            state: previousPage ? 'unchanged' : 'downloaded',
          };
          seenKeys.add(record.sourceKey!);
          downloaded.push(record);
          if (!previousPage) changed.push(record);
        } catch (error: any) {
          failed.push({ contentId: item.id, contentTitle: title, source: 'page', fileName: '', error: error.message });
        }
      }

      const externalUrl = item.contentHandler?.url;
      if (externalUrl && !externalUrl.includes('/bbcswebdav/')) {
        skipped.push({ contentId: item.id, title, reason: 'Enlace externo (no se descarga automáticamente)', url: externalUrl });
      }
      if (item.hasChildren) {
        await visit(item.id, [...relativeParts, `${safeSegment(title, item.id)} [${item.id}]`], depth + 1);
      }
    }
  };


  /**
   * Las actividades del profesor, con sus archivos y su enunciado.
   *
   * El recorrido de arriba baja el árbol de contenidos. Las actividades viven además en el boletín
   * de notas, que enlaza el contenido con las instrucciones y contiene el puntaje:
   * la aplicación sabía que existía "Entrega 1" y cuándo vencía, pero no qué pedía. Y si el profesor
   * colgó los archivos dentro de la actividad y no en una carpeta, tampoco llegaban.
   *
   * Todo cae en "Actividades/<nombre>", junto al enunciado, para que se pueda leer sin conexión,
   * buscar por dentro y consultar como material local.
   */
  const collectActivities = async (): Promise<void> => {
    let columns: Awaited<ReturnType<typeof listAssignments>>;
    try {
      columns = await withBlackboardRetry(() => listAssignments(client, courseId));
    } catch (error: any) {
      enumerationIncomplete = true;
      failed.push({ contentId: courseId, contentTitle: 'Actividades', source: 'attachment', fileName: '', error: `No se pudieron leer las actividades: ${error.message}` });
      return;
    }

    for (const column of columns) {
      const title = column.name ?? String(column.id);
      const folder = resolveDownloadDir(path.relative(canonicalRoot, path.join(base, 'Actividades', `${safeSegment(title, String(column.id))} [${column.id}]`)));

      // Los adjuntos que cuelgan de la actividad, salvo los que el árbol ya trajo.
      let attachments: Awaited<ReturnType<typeof attachmentList>> = [];
      const linkedContentId = column.contentId ? String(column.contentId) : '';
      let description = column.description ?? '';
      let linkedContent: CourseItem | undefined;
      if (linkedContentId) {
        try {
          const content = await withBlackboardRetry(() => getContent(client, courseId, linkedContentId));
          linkedContent = content;
          description = [content.body, content.contentHandler?.instructions, description]
            .filter((value): value is string => typeof value === 'string' && !!value.trim())
            .filter((value, index, values) => values.indexOf(value) === index).join('\n\n');
        } catch (error: any) {
          enumerationIncomplete = true;
          failed.push({ contentId: linkedContentId, contentTitle: title, source: 'activity', fileName: '', error: `No se pudieron leer las indicaciones de la actividad: ${error.message}` });
        }
      }
      if (linkedContentId && !visitedContentIds.has(linkedContentId)) {
        try {
          attachments = await attachmentList(client, courseId, linkedContentId, linkedContent);
        } catch (error: any) {
          enumerationIncomplete = true;
          failed.push({ contentId: linkedContentId, contentTitle: title, source: 'attachment', fileName: '', error: `No se pudieron leer los adjuntos de la actividad: ${error.message}` });
        }
      }

      for (const attachment of attachments) {
        const fileName = attachment.fileName ?? `${linkedContentId}-${attachment.id}`;
        const key = sourceKey('attachment', linkedContentId, attachment.id);
        const fingerprint = `${attachment.id}:${fileName}:${attachment.mimeType ?? ''}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        try {
          const reused = reusePrevious(key, `attachment:${linkedContentId}:${fileName}`, fingerprint);
          if (reused) { downloaded.push(reused); continue; }
          const requestedName = fs.existsSync(safeNewFilePath(folder, fileName)) ? uniqueFilename(folder, fileName) : fileName;
          const result = await downloadStream(client, `/learn/api/public/v1/courses/${courseId}/contents/${linkedContentId}/attachments/${attachment.id}/download`, folder, requestedName);
          const record: DownloadRecord = {
            contentId: linkedContentId, contentTitle: title, source: 'attachment', sourceId: attachment.id,
            sourceKey: key, remoteFingerprint: fingerprint, fileName: result.fileName, saved: result.destination,
            size: result.size, state: 'downloaded',
          };
          downloaded.push(record);
          changed.push(record);
        } catch (error: any) {
          failed.push({ contentId: linkedContentId, contentTitle: title, source: 'attachment', sourceId: attachment.id, sourceKey: key, remoteFingerprint: fingerprint, fileName, error: error.message });
        }
      }

      if (!activityWorthSaving(description, attachments.length)) continue;
      try {
        const document = activityDocument({ ...column, description });
        const fileName = `${safeSegment(title, String(column.id))} - actividad.md`;
        const destination = safeNewFilePath(folder, fileName);
        const fingerprint = crypto.createHash('sha256').update(document).digest('hex');
        const key = sourceKey('activity', String(column.id), 'description');
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const previousActivity = reusePrevious(key, `activity:${column.id}:${fileName}`, fingerprint);
        if (!previousActivity) {
          fs.mkdirSync(folder, { recursive: true });
          const temporary = `${destination}.${process.pid}.next`;
          fs.writeFileSync(temporary, document, { encoding: 'utf8', mode: 0o600 });
          fs.renameSync(temporary, destination);
        }
        const record: DownloadRecord = {
          contentId: linkedContentId || String(column.id), contentTitle: title, source: 'activity',
          sourceId: 'description', sourceKey: key, remoteFingerprint: fingerprint, fileName,
          saved: destination, size: Buffer.byteLength(document, 'utf8'),
          state: previousActivity ? 'unchanged' : 'downloaded',
        };
        downloaded.push(record);
        if (!previousActivity) changed.push(record);
      } catch (error: any) {
        failed.push({ contentId: String(column.id), contentTitle: title, source: 'activity', fileName: '', error: error.message });
      }
    }
  };

  await visit(undefined, [], 0);
  await collectActivities();
  if (enumerationIncomplete) {
    const knownPaths = new Set(downloaded.map(record => record.saved).filter(Boolean));
    for (const record of previous?.downloaded ?? []) {
      if (record.saved && !knownPaths.has(record.saved) && fs.existsSync(record.saved) && fs.lstatSync(record.saved).isFile()) {
        downloaded.push({ ...record, state: 'unchanged' });
      }
    }
  }
  // Los enlaces que el profesor dejó fuera de Aula Virtual se anotaban como "omitido" en el
  // manifiesto y ahí morían: para el estudiante era material que no existía. Entre ellos hay
  // cosas como "Entregue aquí las actividades en clase y el proyecto de investigación".
  const externalLinks = skipped.filter(entry => entry.url);
  if (externalLinks.length) {
    try {
      const document = externalLinksDocument(course.name ?? courseId, externalLinks);
      const destination = safeNewFilePath(base, "Enlaces del profesor.md");
      fs.mkdirSync(base, { recursive: true });
      const temporary = destination + "." + process.pid + ".next";
      fs.writeFileSync(temporary, document, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, destination);
      const key = sourceKey("page", courseId, "enlaces");
      const record: DownloadRecord = {
        contentId: courseId, contentTitle: "Enlaces del profesor", source: "page", sourceId: "enlaces",
        sourceKey: key, remoteFingerprint: crypto.createHash("sha256").update(document).digest("hex"),
        fileName: "Enlaces del profesor.md", saved: destination,
        size: Buffer.byteLength(document, "utf8"), state: "downloaded",
      };
      seenKeys.add(key);
      downloaded.push(record);
    } catch {
      // Un fichero de cortesía no debe tumbar una descarga que ya funcionó.
    }
  }
  const removed = enumerationIncomplete ? [] : (previous?.downloaded ?? []).filter(record => record.sourceKey && !seenKeys.has(record.sourceKey));
  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    course: { id: courseId, name: course.name, courseId: course.courseId },
    directory: base,
    scannedContentItems: itemCount,
    downloaded,
    failed,
    skipped,
    changes: {
      downloaded: changed.length,
      unchanged: downloaded.length - changed.length,
      removed: removed.length,
      failed: failed.length,
    },
    retired: removed.map(record => ({ ...record, retiredAt: new Date().toISOString() })),
    complete: failed.length === 0,
  };
  const manifestPath = path.join(base, 'manifest.json');
  atomicManifestWrite(manifestPath, manifest);
  return { ...manifest, manifestPath };
}
