import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-tests-'));
const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.ts')).sort();
try {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', ...tests.map(name => `tests/${name}`)], {
    cwd: root, stdio: 'inherit', env: {
      ...process.env, UP_MCP_SESSION_DIR: path.join(temporary, 'session'),
      UP_MCP_DOWNLOAD_DIR: path.join(temporary, 'downloads'), UP_MCP_REMEMBER_SSO: '0',
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  const resolved = path.resolve(temporary);
  const relative = path.relative(os.tmpdir(), resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(resolved, { recursive: true, force: true });
}
