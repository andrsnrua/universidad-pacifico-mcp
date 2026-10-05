import type { AxiosInstance } from 'axios';

// Se construye el siguiente offset sobre el mismo endpoint. No se sigue una URL
// de paginación proporcionada por un servidor hacia un host diferente.
export async function readAllPages<T>(
  client: AxiosInstance, endpoint: string, params: Record<string, unknown> = {},
): Promise<{ results: T[] }> {
  const results: T[] = [];
  const limit = 100;
  for (let offset = 0; offset < 10_000;) {
    const response = await client.get(endpoint, { params: { ...params, limit, offset } });
    const page = response.data?.results;
    if (!Array.isArray(page)) throw new Error('Blackboard devolvió una colección inválida.');
    results.push(...page);
    const hasNextPage = typeof response.data?.paging?.nextPage === 'string' && !!response.data.paging.nextPage;
    if (page.length === 0 && hasNextPage) throw new Error('Blackboard indicó otra página sin devolver elementos.');
    if (page.length < limit && !hasNextPage) return { results };
    offset += page.length;
  }
  throw new Error('La colección supera 10 000 elementos. Reduce el intervalo de consulta.');
}
