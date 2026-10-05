import type { AxiosInstance } from 'axios';
import { readAllPages } from './pagination.js';
import type { GradeColumn } from './assignments.js';

export interface Discussion { id: string; title?: string; available?: boolean; gradable?: boolean; topic?: unknown }
export interface DiscussionMessage { id: string; discussionId?: string; parentId?: string; threadId?: string; userId?: string; body?: string; status?: string }
export interface CourseGroup { id: string; groupSetId?: string; name?: string; description?: string; availability?: { available?: string } }
export interface CourseMeeting { id: string; courseId?: string; start?: string; end?: string }
export interface AttendanceRecord { id?: number; meetingId: string; userId?: string; status?: string }
export interface OwnEnrollment { userId?: string; courseId?: string; courseRoleId?: string; [key: string]: unknown }
export interface OwnGrade { userId?: string; columnId?: string; displayGrade?: unknown; score?: number; status?: string; feedback?: string; exempt?: boolean }
export interface ContentReview { userId?: string; contentId?: string; reviewed?: boolean; reviewDate?: string }

export async function listDiscussions(client: AxiosInstance, courseId: string, options: { title?: string; gradable?: boolean } = {}) {
  return readAllPages<Discussion>(client, `/learn/api/public/v1/courses/${courseId}/discussions`, options);
}

export async function getDiscussion(client: AxiosInstance, courseId: string, discussionId: string): Promise<Discussion> {
  return (await client.get(`/learn/api/public/v1/courses/${courseId}/discussions/${discussionId}`)).data;
}

export type DiscussionMessageOptions = { groupId?: string; userId?: string; status?: 'Published' | 'Deleted' | 'Draft' };
export async function listDiscussionMessages(client: AxiosInstance, courseId: string, discussionId: string, options: DiscussionMessageOptions = {}, messageId?: string) {
  const suffix = messageId ? `/messages/${messageId}/replies` : '/messages';
  return readAllPages<DiscussionMessage>(client, `/learn/api/public/v1/courses/${courseId}/discussions/${discussionId}${suffix}`, options);
}

export async function listGroups(client: AxiosInstance, courseId: string, options: { name?: string; inGroupSet?: boolean } = {}) {
  return readAllPages<CourseGroup>(client, `/learn/api/public/v2/courses/${courseId}/groups`, {
    ...options, ...(options.name ? { nameCompare: 'contains' } : {}),
  });
}

export async function getGroup(client: AxiosInstance, courseId: string, groupId: string): Promise<CourseGroup> {
  return (await client.get(`/learn/api/public/v2/courses/${courseId}/groups/${groupId}`)).data;
}

export async function listGroupSets(client: AxiosInstance, courseId: string) {
  return readAllPages<CourseGroup>(client, `/learn/api/public/v2/courses/${courseId}/groups/sets`);
}

export async function listCourseMeetings(client: AxiosInstance, courseId: string) {
  return readAllPages<CourseMeeting>(client, `/learn/api/public/v1/courses/${courseId}/meetings`);
}

// Blackboard explicitly documents that this response is NOT filtered by courseId.
// Only the service that joins it to that course's meeting IDs should expose it.
export async function attendanceByUser(client: AxiosInstance, courseId: string, userId: string) {
  return readAllPages<AttendanceRecord>(client, `/learn/api/public/v1/courses/${courseId}/meetings/users/${userId}`);
}

export async function getOwnEnrollment(client: AxiosInstance, courseId: string, userId: string): Promise<OwnEnrollment> {
  return (await client.get(`/learn/api/public/v1/courses/${courseId}/users/${userId}`)).data;
}

export async function getColumn(client: AxiosInstance, courseId: string, columnId: string): Promise<GradeColumn> {
  return (await client.get(`/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}`)).data;
}

export async function getOwnColumnGrade(client: AxiosInstance, courseId: string, columnId: string, userId: string): Promise<OwnGrade> {
  return (await client.get(`/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/users/${userId}`)).data;
}

export async function getContentReview(client: AxiosInstance, courseId: string, contentId: string, userId: string): Promise<ContentReview> {
  return (await client.get(`/learn/api/public/v1/courses/${courseId}/contents/${contentId}/users/${userId}/reviewStatus`)).data;
}
