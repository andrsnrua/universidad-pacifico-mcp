import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type GetClient, getAuthenticatedClient } from './context.js';
import { registerSessionTools } from './session.js';
import { registerCoursesTools } from './courses.js';
import { registerContentsTools } from './contents.js';
import { registerAnnouncementsTools } from './announcements.js';
import { registerAssessmentTools } from './assessment.js';
import { registerCalendarTools } from './calendar.js';
import { registerParticipationTools } from './participation.js';
import { registerDownloadsTools } from './downloads.js';
import { registerLibraryTools } from './library.js';
import { registerExportsTools } from './exports.js';
import { registerAdvancedTools } from './advanced.js';
export function registerTools(server: McpServer, getClient: GetClient = getAuthenticatedClient): void {
    registerSessionTools(server, getClient);
    registerCoursesTools(server, getClient);
    registerContentsTools(server, getClient);
    registerAnnouncementsTools(server, getClient);
    registerAssessmentTools(server, getClient);
    registerCalendarTools(server, getClient);
    registerParticipationTools(server, getClient);
    registerDownloadsTools(server, getClient);
    registerLibraryTools(server);
    registerExportsTools(server, getClient);
    registerAdvancedTools(server, getClient);
}
