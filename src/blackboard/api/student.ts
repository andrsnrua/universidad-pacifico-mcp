import type { AxiosInstance } from 'axios';
import { readAllPages } from './pagination.js';

export const calendarTypes = ['Course', 'GradebookColumn', 'Institution', 'OfficeHours', 'Personal'] as const;
export type CalendarType = typeof calendarTypes[number];
export const institutionAnnouncements = (client: AxiosInstance, options: { title?: string; includeExpired?: boolean } = {}) =>
  readAllPages<any>(client, '/learn/api/public/v1/announcements', options);
export const visibleCalendars = (client: AxiosInstance) => readAllPages<any>(client, '/learn/api/public/v1/calendars');
export async function calendarEvent(client: AxiosInstance, type: CalendarType, eventId: string) {
  return (await client.get(`/learn/api/public/v1/calendars/items/${type}/${encodeURIComponent(eventId)}`)).data;
}
export async function announcement(client: AxiosInstance, courseId: string, announcementId: string) {
  return (await client.get(`/learn/api/public/v1/courses/${courseId}/announcements/${announcementId}`)).data;
}
export const gradePeriods = (client: AxiosInstance, courseId: string) =>
  readAllPages<any>(client, `/learn/api/public/v1/courses/${courseId}/gradebook/periods`);
