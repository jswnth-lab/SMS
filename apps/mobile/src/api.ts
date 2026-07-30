// EXPO_PUBLIC_* env vars are inlined into the client bundle by Expo at
// build/start time - see apps/mobile/.env / .env.example.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Signs in with phone + password. better-auth's bearer plugin returns the
 * token both as a `set-auth-token` response header and in the JSON body -
 * we read it from the body since that's what's reliably reachable from
 * fetch() on every platform (some header access is restricted on web
 * without extra CORS exposure config).
 */
export async function signInWithPhone(phoneNumber: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/sign-in/phone-number`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Sign-in failed');
  }
  return data.token as string;
}

/**
 * Resolves the current session purely from the bearer token - no cookie
 * involved, which is exactly the mobile-facing path the API's bearer()
 * plugin was added for.
 */
export async function getSession(token: string): Promise<{ user: SessionUser } | null> {
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data ?? null;
}

export async function signOut(token: string): Promise<void> {
  await fetch(`${API_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
