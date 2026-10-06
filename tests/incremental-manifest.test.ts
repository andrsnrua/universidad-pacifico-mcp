import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicManifestWrite, latestCourseManifest, sourceKey } from '../src/downloads/course-materials.js';

test('remote source keys are stable and distinguish attachments from embedded files', () => {
  assert.equal(sourceKey('attachment', '_10_1', '_20_1'), 'attachment:_10_1:_20_1');
  assert.notEqual(sourceKey('attachment', '_10_1', '_20_1'), sourceKey('embedded', '_10_1', '_20_1'));
});

test('the newest valid course manifest is selected during legacy migration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-manifest-'));
  try {
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ generatedAt: '2026-01-01T00:00:00Z', course: { id: '_1_1' }, downloaded: [{ fileName: 'old.pdf' }] }));
    fs.writeFileSync(path.join(directory, 'manifest (2).json'), JSON.stringify({ generatedAt: '2026-02-01T00:00:00Z', course: { id: '_1_1' }, downloaded: [{ fileName: 'new.pdf' }] }));
    assert.equal(latestCourseManifest(directory, '_1_1')?.downloaded?.[0]?.fileName, 'new.pdf');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('canonical manifest writes replace metadata instead of creating numbered copies', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-manifest-write-'));
  try {
    const destination = path.join(directory, 'manifest.json');
    atomicManifestWrite(destination, { version: 1 });
    atomicManifestWrite(destination, { version: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), { version: 2 });
    assert.deepEqual(fs.readdirSync(directory), ['manifest.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
