import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import {
  assertBlackboardFileUrl,
  assertPublicApiUrl,
  assertSameOrigin,
} from '../src/blackboard/api/client.js';
import { blackboardCookies } from '../src/blackboard/auth/session.js';
import { assertTrustedBlackboardCdnUrl } from '../src/downloads/course-materials.js';
import {
  DOWNLOAD_QUOTA_LOCK,
  resolveDownloadDir,
  safeNewFilePath,
  writeLimitedDownload,
  writeNamedDownload,
} from '../src/security/files.js';

test('authenticated Blackboard requests stay on the exact HTTPS origin', () => {
  assert.doesNotThrow(() => assertSameOrigin('/learn/api/public/v1/users/me'));
  assert.doesNotThrow(() => assertSameOrigin('https://aulavirtual.up.edu.pe/bbcswebdav/file'));
  assert.throws(() => assertSameOrigin('https://evil.example/file'), /non-Blackboard host/);
  assert.throws(() => assertSameOrigin('//evil.example/file'), /non-Blackboard host/);
  assert.throws(() => assertSameOrigin('http://aulavirtual.up.edu.pe/file'), /non-Blackboard host/);
});

test('raw API and direct download URLs are narrowed to their intended endpoints', () => {
  assert.doesNotThrow(() => assertPublicApiUrl('/learn/api/public/v1/users/me'));
  assert.throws(() => assertPublicApiUrl('/webapps/portal'), /restricted/);
  assert.doesNotThrow(() => assertBlackboardFileUrl('/bbcswebdav/xid-123'));
  assert.throws(() => assertBlackboardFileUrl('/learn/api/public/v1/users/me'), /Direct downloads/);
});

test('Blackboard CDN redirects are allowlisted without trusting arbitrary subdomains', () => {
  assert.equal(
    assertTrustedBlackboardCdnUrl('https://alt-5f3c200ba95ce.blackboard.com/file').hostname,
    'alt-5f3c200ba95ce.blackboard.com',
  );
  assert.throws(
    () => assertTrustedBlackboardCdnUrl('https://blackboard.com/file'),
    /no autorizada/,
  );
  assert.throws(
    () => assertTrustedBlackboardCdnUrl('https://alt-safe.blackboard.com.attacker.test/file'),
    /no autorizada/,
  );
  assert.throws(
    () => assertTrustedBlackboardCdnUrl('http://alt-safe.blackboard.com/file'),
    /no autorizada/,
  );
});

test('only Blackboard cookies survive session persistence', () => {
  const cookies = blackboardCookies([
    { name: 'BbRouter', value: 'ok', domain: 'aulavirtual.up.edu.pe', path: '/' },
    { name: 'parent', value: 'ok', domain: '.up.edu.pe', path: '/' },
    { name: 'ESTSAUTH', value: 'secret', domain: '.login.microsoftonline.com', path: '/' },
    { name: 'lookalike', value: 'bad', domain: 'evil-aulavirtual.up.edu.pe', path: '/' },
  ]);
  assert.deepEqual(cookies.map((cookie) => cookie.name), ['BbRouter', 'parent']);
});


test('MCP downloads stay under their configured root and never overwrite', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-download-test-'));
  const previous = process.env.UP_MCP_DOWNLOAD_DIR;
  process.env.UP_MCP_DOWNLOAD_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR;
    else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.throws(() => resolveDownloadDir('/tmp/outside'), /must be relative/);
  assert.throws(() => resolveDownloadDir('../outside'), /outside/);
  assert.throws(() => resolveDownloadDir(`${DOWNLOAD_QUOTA_LOCK}/child`), /reserved/);
  assert.throws(() => resolveDownloadDir(`${DOWNLOAD_QUOTA_LOCK.toUpperCase()}/child`), /reserved/);
  assert.throws(
    () => safeNewFilePath(root, '.file.123.12345678-1234-1234-1234-123456789abc.part'),
    /unsafe filename/,
  );
  assert.throws(
    () => safeNewFilePath(root, `${DOWNLOAD_QUOTA_LOCK}.reap-user-file`),
    /unsafe filename/,
  );
  assert.throws(
    () => safeNewFilePath(root, `${DOWNLOAD_QUOTA_LOCK.toUpperCase()}.REAP-user-file`),
    /unsafe filename/,
  );

  const dir = resolveDownloadDir('course');
  const destination = safeNewFilePath(dir, '../material.pdf');
  assert.equal(destination, path.join(dir, 'material.pdf'));
  assert.equal(await writeLimitedDownload(Readable.from(['hello']), destination, 10), 5);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'hello');
  assert.throws(
    () => fs.openSync(destination, 'wx'),
    (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
  );
});

test('oversized downloads are deleted instead of leaving partial files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-limit-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'large.bin');
  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(8)]), destination, 4),
    /safety limit/,
  );
  assert.equal(fs.existsSync(destination), false);
});

test('download streams are destroyed when exclusive destination creation fails', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-stream-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'existing.bin');
  fs.writeFileSync(destination, 'existing');
  const input = new PassThrough();

  await assert.rejects(
    writeLimitedDownload(input, destination),
    (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
  );
  assert.equal(input.destroyed, true);
});

test('the final download name is published only after the stream completes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-publish-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'material.pdf');
  const input = new PassThrough();
  const download = writeLimitedDownload(input, destination, 20);

  input.write('partial');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.part')), true);

  input.end('-complete');
  assert.equal(await download, 16);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'partial-complete');
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.part')), false);
});

test('download streams are destroyed when response-derived filenames are unsafe', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-name-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = new PassThrough();

  await assert.rejects(writeNamedDownload(input, root, '..'), /unsafe filename/);
  assert.equal(input.destroyed, true);
});

test('the configured download root itself cannot be a symlink', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-root-link-test-'));
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'downloads');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link);
  const previous = process.env.UP_MCP_DOWNLOAD_DIR;
  process.env.UP_MCP_DOWNLOAD_DIR = link;
  t.after(() => {
    if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR;
    else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  });
  assert.throws(() => resolveDownloadDir(), /symbolic link/);
});

test('missing directories beneath symlinks are rejected before creation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-parent-link-test-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-parent-target-'));
  fs.symlinkSync(outside, path.join(root, 'linked-outside'));
  const previous = process.env.UP_MCP_DOWNLOAD_DIR;
  process.env.UP_MCP_DOWNLOAD_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR;
    else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  assert.throws(() => resolveDownloadDir('linked-outside/new'), /symlink/);
  assert.equal(fs.existsSync(path.join(outside, 'new')), false);
});

test('the download directory quota includes files already on disk', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-quota-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'existing.bin'), Buffer.alloc(3));
  const destination = path.join(root, 'new.bin');
  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(2)]), destination, 10, { root, maxBytes: 4 }),
    /safety limit/,
  );
  assert.equal(fs.existsSync(destination), false);
});

test('abandoned private download files are reclaimed while holding the quota lock', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-part-cleanup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const abandoned = path.join(
    root,
    '.material.pdf.123.12345678-1234-1234-1234-123456789abc.part',
  );
  fs.writeFileSync(abandoned, Buffer.alloc(10));
  const destination = path.join(root, 'new.bin');

  assert.equal(
    await writeLimitedDownload(Readable.from(['hello']), destination, 10, { root, maxBytes: 10 }),
    5,
  );
  assert.equal(fs.existsSync(abandoned), false);
});

test('nested reaper-prefixed user directories are preserved and counted', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-nested-reaper-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nested = path.join(root, 'course', `${DOWNLOAD_QUOTA_LOCK}.reap-not-internal`);
  fs.mkdirSync(nested, { recursive: true });
  const existing = path.join(nested, 'material.bin');
  fs.writeFileSync(existing, Buffer.alloc(8));
  const destination = path.join(root, 'new.bin');

  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(3)]), destination, 10, { root, maxBytes: 10 }),
    /safety limit/,
  );
  assert.equal(fs.existsSync(existing), true);
  assert.equal(fs.readFileSync(existing).byteLength, 8);
});

test('download quota waits for a filesystem lock shared with other processes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-quota-lock-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockPath = path.join(root, DOWNLOAD_QUOTA_LOCK);
  fs.mkdirSync(lockPath);
  const destination = path.join(root, 'new.bin');
  let settled = false;
  const download = writeLimitedDownload(
    Readable.from(['hello']),
    destination,
    10,
    { root, maxBytes: 20 },
  ).finally(() => { settled = true; });

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(settled, false);
  fs.rmdirSync(lockPath);
  assert.equal(await download, 5);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'hello');
});

test('a replaced quota lock fences the old writer before final publication', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-quota-fence-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'new.bin');
  const input = new PassThrough();
  const download = writeLimitedDownload(input, destination, 20, { root, maxBytes: 20 });
  const lockPath = path.join(root, DOWNLOAD_QUOTA_LOCK);
  // The lock is taken in two steps: the folder, then the owner's token inside it. Replacing it
  // between the two would let the writer put its token into the replacement and never notice, so
  // wait until it is fully taken — that is the situation this test is about.
  const ownerPath = path.join(lockPath, 'owner');
  for (let attempt = 0; attempt < 200 && !fs.existsSync(ownerPath); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(fs.existsSync(ownerPath), true);
  fs.rmSync(lockPath, { recursive: true });
  fs.mkdirSync(lockPath);
  input.end('complete');

  await assert.rejects(download, /quota lock was replaced/);
  assert.equal(fs.existsSync(destination), false);
});

test('a folder in the library that Windows will not list does not block downloads elsewhere', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-download-eperm-'));
  const previous = process.env.UP_MCP_DOWNLOAD_DIR;
  process.env.UP_MCP_DOWNLOAD_DIR = root;
  const locked = path.join(root, 'Seguridad', 'CursoUP');
  fs.mkdirSync(locked, { recursive: true });
  const original = fs.readdirSync;
  t.mock.method(fs, 'readdirSync', ((dir: fs.PathLike, options?: any) => {
    if (path.resolve(String(dir)) === path.resolve(locked)) throw Object.assign(new Error('EPERM: operation not permitted, scandir'), { code: 'EPERM' });
    return original(dir, options);
  }) as typeof fs.readdirSync);
  t.after(() => {
    if (previous === undefined) delete process.env.UP_MCP_DOWNLOAD_DIR;
    else process.env.UP_MCP_DOWNLOAD_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const destination = safeNewFilePath(resolveDownloadDir('Data Mining'), 'Sesion9.pdf');
  assert.equal(await writeLimitedDownload(Readable.from(['pdf']), destination, 10), 3);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'pdf');
});
