import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { authAccount, authSession, authUser, authVerification, db } from '@monorepo/db';
import { betterAuth } from 'better-auth';

// better-auth owns its own identity/session/credential tables (user,
// session, account, verification - see packages/db/src/schema/auth.ts).
// It intentionally connects through the DB owner connection (same `db` as
// migrations/seed), not the RLS-scoped app_rw one: sign-up and login are
// pre-tenant operations (there's no school context yet to set), and these
// tables carry no school_id to scope by in the first place.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});
