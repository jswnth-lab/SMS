import type { Context } from 'hono';

/**
 * postgres.js throws PostgresError with a `.code` set to the SQLSTATE, but
 * Drizzle wraps it in a DrizzleQueryError ("Failed query: ...") with the
 * original error on `.cause` - so the SQLSTATE has to be looked up there too.
 */
function hasPgCode(err: unknown, code: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ((err as { code?: string }).code === code) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === 'object' && cause !== null && (cause as { code?: string }).code === code;
}

/**
 * Maps common Postgres constraint violations to HTTP responses so route
 * handlers don't each need to know SQLSTATE codes. Rethrows anything else -
 * callers should let it propagate to the global error handler.
 */
export function handleDbError(c: Context, err: unknown): Response {
  if (hasPgCode(err, '23505')) {
    return c.json({ error: 'Conflict: a record with these values already exists' }, 409);
  }
  if (hasPgCode(err, '23503')) {
    return c.json({ error: 'Conflict: this record is referenced by, or references, another record' }, 409);
  }
  if (hasPgCode(err, '23514')) {
    return c.json({ error: 'Invalid data: violates a database constraint' }, 400);
  }
  throw err;
}
