import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { authAccount, authSession, authUser, authVerification, db } from '@monorepo/db';
import { betterAuth } from 'better-auth';
import { bearer, phoneNumber } from 'better-auth/plugins';

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
  // Email + password sign-IN stays open (POST /api/auth/sign-in/email);
  // sign-UP is deliberately disabled. Registration is invite-only: an admin
  // creates an invite (POST /invites), the invited person redeems it
  // (POST /invites/:token/accept in invites.ts), which provisions the
  // better-auth identity directly via Drizzle rather than through this
  // route. There is no public account-creation path.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  plugins: [
    // Phone + password: POST /api/auth/sign-in/phone-number.
    // sendOTP is only used for phone verification / password-reset flows
    // (not required for a plain phone+password sign-in). No SMS provider is
    // wired up yet, so this logs the code instead of sending it - swap this
    // out for a real provider (Twilio, etc.) before this goes anywhere near
    // production.
    phoneNumber({
      sendOTP: ({ phoneNumber: to, code }) => {
        console.log(`[dev] OTP for ${to}: ${code}`);
      },
    }),
    // Session strategy: better-auth's default is a cookie
    // (better-auth.session_token, HttpOnly), which is what the web app uses
    // out of the box. The bearer plugin additionally accepts
    // `Authorization: Bearer <token>` and resolves it to the same session
    // server-side - that's the mechanism the mobile app will use later,
    // since a native client has no cookie jar. Both work simultaneously;
    // nothing else needs to change when mobile starts calling this API.
    bearer(),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081').split(','),
});
