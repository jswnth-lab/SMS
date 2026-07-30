import { authAccount, authUser, db } from '@monorepo/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Creates a better-auth identity (authUser + a credential authAccount)
 * directly via Drizzle, bypassing better-auth's own /sign-up/email route
 * entirely. That route is deliberately locked down (see auth.ts,
 * emailAndPassword.disableSignUp) so registration can only happen through
 * the invite-accept flow that calls this function - not through public
 * self-signup. Uses better-auth's own hashPassword so the resulting
 * account row is byte-for-byte what the library itself would have written,
 * meaning normal sign-in (/api/auth/sign-in/email,
 * /api/auth/sign-in/phone-number) works against it unmodified.
 */
export async function provisionAuthUser(input: {
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const id = crypto.randomUUID();

  const [user] = await db
    .insert(authUser)
    .values({
      id,
      name: input.name,
      email: input.email,
      emailVerified: false,
      phoneNumber: input.phoneNumber,
      phoneNumberVerified: input.phoneNumber ? false : null,
    })
    .returning();

  await db.insert(authAccount).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    providerId: 'credential',
    userId: user.id,
    password: passwordHash,
  });

  return user;
}
