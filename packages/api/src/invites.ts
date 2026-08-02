import { createHash, randomBytes } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { db, invites, schoolMemberships, schools, users } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from './auth';
import { provisionAuthUser } from './auth-provisioning';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Every invite/registration write below goes through the DB owner
// connection (same `db` used by auth.ts/migrations/seed), not the
// RLS-scoped app_rw one - creating a user, a membership, or an invite spans
// or precedes tenant context (there's no school_id session variable to set
// for "does this person get to exist yet"), same reasoning as why
// better-auth itself uses the owner connection.
async function requireAdminMembership(headers: Headers, schoolId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const [domainUser] = await db.select().from(users).where(eq(users.authUserId, session.user.id));
  if (!domainUser) return null;

  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, domainUser.id),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.role, 'admin'),
        eq(schoolMemberships.status, 'active')
      )
    );
  return membership ?? null;
}

const createInviteSchema = z.object({
  schoolId: z.string().uuid(),
  phoneNumber: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(['student', 'parent', 'teacher', 'admin']),
});

const acceptInviteSchema = z.object({
  password: z.string().min(8),
  name: z.string().min(1),
  nameAr: z.string().optional(),
});

const tokenParam = z.object({ token: z.string().min(1) });

// Chained (not `const r = new Hono(); r.post(...)`) so each route's type
// flows into this module's export and from there into `AppType` in
// index.ts - see index.ts's tenantRoutes / me.ts for the same reasoning.
const inviteRoutes = new Hono()
  // Admin-only: create an invite. Registration is invite-only - there is no
  // public /sign-up route (see auth.ts, emailAndPassword.disableSignUp).
  .post('/invites', zValidator('json', createInviteSchema), async (c) => {
    const { schoolId, phoneNumber, email, role } = c.req.valid('json');

    const adminMembership = await requireAdminMembership(c.req.raw.headers, schoolId);
    if (!adminMembership) {
      return c.json({ error: 'Admin session for this school is required' }, 403);
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + ONE_WEEK_MS);

    const [invite] = await db
      .insert(invites)
      .values({
        schoolId,
        phoneNumber,
        email,
        role,
        invitedByMembershipId: adminMembership.id,
        tokenHash,
        expiresAt,
      })
      .returning();

    // Dev convenience only: no SMS/email provider is wired up yet, so the raw
    // token is logged and returned directly instead of being delivered out of
    // band. Swap this for real delivery (and stop returning it in the
    // response) before this goes anywhere near production.
    console.log(`[dev] invite token for ${phoneNumber}: ${rawToken}`);

    return c.json({ inviteId: invite.id, token: rawToken, expiresAt: invite.expiresAt });
  })
  // Public: lets the "set your password" screen prefill who's being invited
  // without requiring auth - the token itself is the credential here.
  .get('/invites/:token', zValidator('param', tokenParam), async (c) => {
    const { token } = c.req.valid('param');
    const tokenHash = hashToken(token);
    const [invite] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash));
    if (!invite) return c.json({ error: 'Invite not found' }, 404);
    if (invite.acceptedAt) return c.json({ error: 'Invite already accepted' }, 410);
    if (invite.expiresAt < new Date()) return c.json({ error: 'Invite expired' }, 410);

    const [school] = await db.select().from(schools).where(eq(schools.id, invite.schoolId));
    return c.json({
      phoneNumber: invite.phoneNumber,
      email: invite.email,
      role: invite.role,
      schoolName: school?.name ?? null,
    });
  })
  // Public: the only way a new login can be created. Provisions the
  // better-auth identity directly (bypassing the locked-down /sign-up/email
  // route entirely) then creates-or-links the domain `users` profile and the
  // school_membership for the invited role.
  .post(
    '/invites/:token/accept',
    zValidator('param', tokenParam),
    zValidator('json', acceptInviteSchema),
    async (c) => {
      const { token } = c.req.valid('param');
      const { password, name, nameAr } = c.req.valid('json');
      const tokenHash = hashToken(token);

      const [invite] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash));
      if (!invite) return c.json({ error: 'Invite not found' }, 404);
      if (invite.acceptedAt) return c.json({ error: 'Invite already accepted' }, 410);
      if (invite.expiresAt < new Date()) return c.json({ error: 'Invite expired' }, 410);

      let [domainUser] = await db.select().from(users).where(eq(users.phone, invite.phoneNumber));
      if (domainUser?.authUserId) {
        return c.json({ error: 'This phone number already has an account' }, 409);
      }

      const authUserRow = await provisionAuthUser({
        name,
        email: invite.email ?? `${invite.phoneNumber.replace(/\D/g, '')}@placeholder.invalid`,
        password,
        phoneNumber: invite.phoneNumber,
      });

      if (domainUser) {
        [domainUser] = await db
          .update(users)
          .set({ authUserId: authUserRow.id })
          .where(eq(users.id, domainUser.id))
          .returning();
      } else {
        [domainUser] = await db
          .insert(users)
          .values({
            phone: invite.phoneNumber,
            email: invite.email,
            passwordHash: 'managed-by-better-auth',
            nameEn: name,
            nameAr,
            authUserId: authUserRow.id,
          })
          .returning();
      }

      await db.insert(schoolMemberships).values({
        userId: domainUser.id,
        schoolId: invite.schoolId,
        role: invite.role,
        status: 'active',
      });

      await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

      return c.json({ status: 'ok' });
    }
  );

export default inviteRoutes;
