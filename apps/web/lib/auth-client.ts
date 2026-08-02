import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient } from 'better-auth/client/plugins';

// Cookie-based session (credentials: 'include' by default for same-origin
// fetch, but the API runs on a different port in dev - see
// apps/web/lib/api.ts for the matching credentials: 'include' on the typed
// RPC client). baseURL points at the Hono API's better-auth mount
// (src/index.ts: `.on(['POST', 'GET'], '/api/auth/*', ...)`), not the
// Next.js app itself.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  plugins: [phoneNumberClient()],
});

export const { useSession, signOut } = authClient;
