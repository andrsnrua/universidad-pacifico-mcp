import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mcp-smoke-'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const client = new Client({ name: 'up-mcp-public-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [path.join(root, 'dist/index.js')], stderr: 'pipe',
  env: { ...process.env, UP_MCP_SESSION_DIR: path.join(temporary, 'session'), UP_MCP_DOWNLOAD_DIR: path.join(temporary, 'downloads'), UP_MCP_REMEMBER_SSO: '0' },
});
let stderr = '';
transport.stderr?.on('data', data => { stderr += data.toString(); });
try {
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, pkg.name);
  assert.equal(client.getServerVersion()?.version, pkg.version);
  const { tools } = await client.listTools();
  const expected = [
    'blackboard_login', 'blackboard_logout', 'blackboard_whoami', 'blackboard_system_version',
    'blackboard_list_courses', 'blackboard_get_course', 'blackboard_list_contents', 'blackboard_get_content',
    'blackboard_list_announcements', 'blackboard_list_assignments', 'blackboard_list_attempts',
    'blackboard_get_grades', 'blackboard_get_grade_columns', 'blackboard_list_calendar',
    'blackboard_list_attachments', 'blackboard_download_attachment', 'blackboard_download_file_url',
    'blackboard_download_course_materials', 'blackboard_get_assignment_feedback', 'blackboard_raw_get',
    'blackboard_get_course_overview', 'blackboard_search_contents', 'blackboard_find_syllabus',
    'blackboard_get_assignment_details', 'blackboard_get_attempt', 'blackboard_list_attempt_files',
    'blackboard_get_grade_categories', 'blackboard_get_course_agenda',
    'blackboard_list_course_files', 'blackboard_list_course_links', 'blackboard_search_announcements',
    'blackboard_export_course_agenda', 'blackboard_export_course_grades',
    'blackboard_list_discussions', 'blackboard_get_discussion', 'blackboard_list_discussion_messages', 'blackboard_list_discussion_replies',
    'blackboard_list_groups', 'blackboard_get_group', 'blackboard_list_group_sets', 'blackboard_list_course_meetings',
    'blackboard_get_my_attendance', 'blackboard_get_my_enrollment', 'blackboard_get_grade_detail',
    'blackboard_get_content_review_status', 'blackboard_get_multi_course_agenda',
    'blackboard_list_institution_announcements', 'blackboard_list_calendars', 'blackboard_get_calendar_event', 'blackboard_get_announcement', 'blackboard_list_grade_periods',
    'blackboard_get_course_outline', 'blackboard_search_multi_course_contents', 'blackboard_search_multi_course_announcements', 'blackboard_get_submission_receipts',
    'blackboard_get_course_review_summary', 'blackboard_get_course_gradebook', 'blackboard_get_multi_course_gradebook', 'blackboard_get_multi_course_overview', 'blackboard_get_study_brief',
    'blackboard_list_downloaded_materials', 'blackboard_read_downloaded_material', 'blackboard_search_downloaded_materials', 'blackboard_inspect_course_manifest',
    'blackboard_export_multi_course_agenda', 'blackboard_export_attendance', 'blackboard_export_course_outline', 'blackboard_export_study_brief', 'blackboard_export_submission_receipts', 'blackboard_export_multi_course_grades',
  ];
  assert.deepEqual(tools.map(tool => tool.name).sort(), expected.sort());
  for (const tool of tools) {
    assert(tool.annotations, `Faltan anotaciones de ${tool.name}.`);
    const changesLocal = tool.name.startsWith('blackboard_download_') || tool.name.includes('export') || tool.name === 'blackboard_login' || tool.name === 'blackboard_logout';
    assert.equal(tool.annotations.readOnlyHint, !changesLocal, tool.name);
  }
  const { resources } = await client.listResources();
  assert(resources.some(resource => resource.uri === 'upacifico://guide'));
  const guide = await client.readResource({ uri: 'upacifico://guide' });
  assert(guide.contents[0].text.includes('Universidad del Pacífico'));
  const { prompts } = await client.listPrompts();
  assert.equal(prompts.length, 5);
  const prompt = await client.getPrompt({ name: 'revisar_curso', arguments: { courseId: '_12345_1' } });
  assert(prompt.messages[0].content.text.includes('_12345_1'));
  const noSession = await client.callTool({ name: 'blackboard_whoami', arguments: {} });
  assert.equal(noSession.isError, true);
  assert(!JSON.stringify(noSession).includes('synthetic-secret'));
  const badId = await client.callTool({ name: 'blackboard_get_course', arguments: { courseId: '../invalid' } });
  assert.equal(badId.isError, true);
  const badRange = await client.callTool({ name: 'blackboard_list_calendar', arguments: { since: '2026-10-10T00:00:00-05:00', until: '2026-10-01T00:00:00-05:00' } });
  assert.equal(badRange.isError, true);
  const longRange = await client.callTool({ name: 'blackboard_list_calendar', arguments: { since: '2026-01-01T00:00:00Z', until: '2026-12-01T00:00:00Z' } });
  assert.equal(longRange.isError, true);
  assert(JSON.stringify(longRange).includes('112'));
  const badSearch = await client.callTool({ name: 'blackboard_search_contents', arguments: { courseId: '_12345_1', query: 'silabo', maxItems: 1001 } });
  assert.equal(badSearch.isError, true);
  const missingAttempt = await client.callTool({ name: 'blackboard_get_attempt', arguments: { courseId: '_12345_1', columnId: '_2_1' } });
  assert.equal(missingAttempt.isError, true);
  const badExtension = await client.callTool({ name: 'blackboard_list_course_files', arguments: { courseId: '_12345_1', extensions: ['../pdf'] } });
  assert.equal(badExtension.isError, true);
  const longExport = await client.callTool({ name: 'blackboard_export_course_agenda', arguments: { courseId: '_12345_1', since: '2026-01-01T00:00:00Z', until: '2026-12-01T00:00:00Z' } });
  assert.equal(longExport.isError, true);
  assert(JSON.stringify(longExport).includes('112'));
  const badDiscussion = await client.callTool({ name: 'blackboard_get_discussion', arguments: { courseId: '_12345_1', discussionId: '../invalid' } });
  assert.equal(badDiscussion.isError, true);
  const badGroupFilter = await client.callTool({ name: 'blackboard_list_groups', arguments: { courseId: '_12345_1', inGroupSet: '_2_1' } });
  assert.equal(badGroupFilter.isError, true);
  const tooManyCourses = await client.callTool({ name: 'blackboard_get_multi_course_agenda', arguments: { courseIds: Array.from({ length: 11 }, (_, index) => `_${index}_1`), since: '2026-10-05T00:00:00Z', until: '2026-10-12T00:00:00Z' } });
  assert.equal(tooManyCourses.isError, true);
  const logout = await client.callTool({ name: 'blackboard_logout', arguments: {} });
  const unsafeLocal = await client.callTool({ name: 'blackboard_read_downloaded_material', arguments: { path: '../session.json' } });
  assert.equal(unsafeLocal.isError, true);
  const hugePages = await client.callTool({ name: 'blackboard_read_downloaded_material', arguments: { path: 'ficticio.pdf', maxPages: 21 } });
  assert.equal(hugePages.isError, true);
  const invalidCalendarType = await client.callTool({ name: 'blackboard_get_calendar_event', arguments: { type: 'Admin', eventId: '_1_1' } });
  assert.equal(invalidCalendarType.isError, true);
  fs.mkdirSync(path.join(temporary, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'downloads', 'ficticio.txt'), 'Texto ficticio sin sesión institucional.');
  const offlineText = await client.callTool({ name: 'blackboard_read_downloaded_material', arguments: { path: 'ficticio.txt' } });
  assert(!offlineText.isError); assert(JSON.parse(offlineText.content[0].text).text.includes('Texto ficticio'));
  fs.writeFileSync(path.join(temporary, 'downloads', 'invalido.pdf'), '%PDF-1.4\ninvalid');
  const brokenPdf = await client.callTool({ name: 'blackboard_read_downloaded_material', arguments: { path: 'invalido.pdf' } });
  assert.equal(brokenPdf.isError, true);
  assert(!logout.isError);
  assert.equal(stderr, '', 'El arranque sin sesión produjo registros inesperados.');
  console.log(JSON.stringify({ name: pkg.name, version: pkg.version, tools: tools.length, resources: resources.length, prompts: prompts.length, stdio: 'passed', authenticatedRequests: 0 }, null, 2));
} finally {
  await client.close();
  const relative = path.relative(os.tmpdir(), temporary);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(temporary, { recursive: true, force: true });
}
