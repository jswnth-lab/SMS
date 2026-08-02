// Idempotent dev helper: ensures a demo admin login exists for the seeded
// "Demo School" (packages/db/src/seed.ts), with a fixed, documented
// password - safe to re-run any time (e.g. after `pnpm db:seed` recreates
// the school) since it resets the password instead of failing if the
// account already exists. Distinct from bootstrap-admin.ts, which
// provisions a login for the seed's own admin@example.com and refuses to
// touch it if one already exists (that account's password may be unknown
// to whoever is running this repo, since it isn't fixed).
import { authAccount, db, schoolMemberships, schools, users } from '@monorepo/db';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { provisionAuthUser } from '../auth-provisioning';

export const DEMO_EMAIL = 'demo.admin@school.dev';
export const DEMO_PASSWORD = 'DemoAdmin123!';

async function main() {
  const [school] = await db.select().from(schools).where(eq(schools.slug, 'demo-school'));
  if (!school) throw new Error('Demo school not found - run `pnpm db:seed` first.');

  let [domainUser] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));

  if (domainUser?.authUserId) {
    // Account already exists - reset its password rather than erroring, so
    // this script is safe to re-run whenever the demo credentials need to
    // be recovered.
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await db
      .update(authAccount)
      .set({ password: passwordHash })
      .where(eq(authAccount.userId, domainUser.authUserId));
  } else {
    const authUserRow = await provisionAuthUser({
      name: 'Demo Admin',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      phoneNumber: '+10000099999',
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
          phone: '+10000099999',
          email: DEMO_EMAIL,
          passwordHash: 'managed-by-better-auth',
          nameEn: 'Demo Admin',
          authUserId: authUserRow.id,
        })
        .returning();
    }
  }

  const [existingMembership] = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, domainUser.id));

  if (!existingMembership) {
    await db.insert(schoolMemberships).values({
      userId: domainUser.id,
      schoolId: school.id,
      role: 'admin',
      status: 'active',
    });
  }

  console.log(`Demo login ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
