import { createDb } from '@monorepo/db';

// The connection every tenant-scoped business route queries through - it's
// the `app_rw` Postgres role, which IS subject to RLS (unlike the owner
// `db` export from @monorepo/db used by auth/invites/migrations/seed).
const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ?? 'postgresql://app_rw:app_rw_dev_pass@localhost:5433/skldb';

export const { db: appDb } = createDb(APP_DATABASE_URL);
