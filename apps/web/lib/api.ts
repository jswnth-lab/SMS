import { createApiClient } from '@monorepo/api/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Builds a typed RPC client (`hc<AppType>()`) for a specific school
 * context. `credentials: 'include'` sends the better-auth session cookie
 * cross-origin (web app and API run on different ports in dev - see
 * auth.ts's CORS config). `X-School-Id` is only required by the API's
 * tenantContext() middleware when the caller has more than one active
 * membership (packages/api/src/middleware/tenant-context.ts) - harmless to
 * send unconditionally otherwise.
 */
export function getApiClient(schoolId?: string) {
  return createApiClient(API_URL, {
    credentials: 'include',
    headers: schoolId ? { 'X-School-Id': schoolId } : undefined,
  });
}
