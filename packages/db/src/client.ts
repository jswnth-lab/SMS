import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/monorepo_dev';

// Owner connection: used by drizzle-kit generate/migrate and db:seed. The
// underlying Postgres role is a superuser, so it always bypasses row-level
// security regardless of FORCE ROW LEVEL SECURITY - migrations and seeding
// are unaffected by the RLS policies added in 0005_row_level_security.sql.
export const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type Database = typeof db;

/**
 * Creates a separate connection pool, e.g. for the app_rw role that the API
 * actually queries through and which IS subject to RLS (unlike the owner
 * connection above).
 */
export function createDb(url: string) {
  const conn = postgres(url);
  return { client: conn, db: drizzle(conn, { schema }) };
}

/**
 * Runs `fn` inside a transaction with the tenant session variables set via
 * SET LOCAL equivalents (set_config(..., true) scopes to the current
 * transaction only, and - unlike a literal SET LOCAL statement - accepts
 * bound parameters, so school/user ids never get string-interpolated into
 * SQL text). Policies read these back with
 * current_setting('app.school_id', true) / current_setting('app.user_id', true).
 */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function withTenantContext<T>(
  scopedDb: Database,
  ctx: { schoolId: string; userId?: string },
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return scopedDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.school_id', ${ctx.schoolId}, true), set_config('app.user_id', ${ctx.userId ?? NIL_UUID}, true)`
    );
    return fn(tx as unknown as Database);
  });
}
