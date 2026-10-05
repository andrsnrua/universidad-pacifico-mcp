import { readAllPages } from './pagination.js';
import type { AxiosInstance } from 'axios';

export interface GradeColumn {
  id: string;
  name: string;
  /**
   * Descripción opcional de la columna. Las instrucciones pueden estar únicamente
   * en el contenido enlazado por contentId; no se presupone que esta descripción exista.
   */
  description?: string;
  contentId?: string;
  score?: { possible: number };
  availability?: { available: string };
  grading?: {
    type: 'Attempts' | 'Manual' | 'Calculated';
    due?: string;
    attemptsAllowed?: number;
    scoringModel?: string;
  };
  gradebookCategoryId?: string;
  scoreProviderHandle?: string;
  includeInCalculations?: boolean;
}

export interface Attempt {
  id: string;
  userId?: string;
  status: string;
  displayGrade?: { score?: number; text?: string };
  score?: number;
  text?: string;
  studentComments?: string;
  studentSubmission?: string;
  created?: string;
  modified?: string;
  attemptDate?: string;
  files?: Array<{ id: string; fileName: string; mimeType: string }>;
  // Instructor feedback fields
  instructorFeedback?: string;
  feedback?: string;
}

export interface AttemptFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  href?: string;
}

export async function listAssignments(
  client: AxiosInstance,
  courseId: string
): Promise<GradeColumn[]> {
  const page = await readAllPages<GradeColumn>(client, `/learn/api/public/v2/courses/${courseId}/gradebook/columns`);
  return page.results.filter(c => c.grading?.type === 'Attempts' || c.grading?.type === 'Manual');
}

export async function listAttempts(
  client: AxiosInstance,
  courseId: string,
  columnId: string
): Promise<Attempt[]> {
  return (await readAllPages<Attempt>(client, `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts`)).results;
}

export async function getAttempt(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  attemptId: string
): Promise<Attempt> {
  const r = await client.get(
    `/learn/api/public/v2/courses/${courseId}/gradebook/columns/${columnId}/attempts/${attemptId}`
  );
  return r.data;
}

// uploadFile y submitAttempt vivían aquí: subían un archivo y enviaban un intento con POST
// reales contra Blackboard. Este servidor se documenta a sí mismo como de sólo lectura y la
// auditoría promete no enviar entregas, pero el subcomando que las usaba seguía registrado y
// alcanzable. Una entrega enviada por error no se deshace, así que el camino entero se retiró en
// vez de dejarlo desconectado a la espera de que alguien lo vuelva a enganchar.

export async function getAttemptFiles(
  client: AxiosInstance,
  courseId: string,
  columnId: string,
  attemptId: string
): Promise<AttemptFile[]> {
  // The file endpoint has no columnId. Check the requested column/attempt
  // relationship first, including the account's permission to read that attempt.
  await getAttempt(client, courseId, columnId, attemptId);
  return (await readAllPages<AttemptFile>(client, `/learn/api/public/v1/courses/${courseId}/gradebook/attempts/${attemptId}/files`)).results;
}

// getMyGrade vivía aquí: la nota de una columna para un usuario. Sin llamador desde que existe.
