// Idempotent dev helper: ensures demo logins exist for the seeded "Demo
// School" (packages/db/src/seed.ts), with fixed, documented passwords -
// safe to re-run any time (e.g. after `pnpm db:seed` recreates the school)
// since it resets passwords instead of failing if the accounts already
// exist. Distinct from bootstrap-admin.ts, which provisions a login for
// the seed's own admin@example.com and refuses to touch it if one already
// exists (that account's password may be unknown to whoever is running
// this repo, since it isn't fixed).
//
// The teacher login reuses the seed's own teacher1@example.com profile
// (rather than creating a fresh membership with no data behind it) so it
// comes with real teaching_assignments, timetable slots, assessments, and
// homework already attached - useful for exercising the teacher surface
// end-to-end instead of against an empty schedule.
import { authAccount, db, schoolMemberships, schools, users } from '@monorepo/db';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { provisionAuthUser } from '../auth-provisioning';

export const DEMO_ADMIN_EMAIL = 'demo.admin@school.dev';
export const DEMO_ADMIN_PASSWORD = 'DemoAdmin123!';
export const DEMO_TEACHER_EMAIL = 'teacher1@example.com';
export const DEMO_TEACHER_PASSWORD = 'DemoTeacher123!';

async function ensureLogin(opts: {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'admin' | 'teacher';
  schoolId: string;
}) {
  let [domainUser] = await db.select().from(users).where(eq(users.email, opts.email));

  if (domainUser?.authUserId) {
    const passwordHash = await hashPassword(opts.password);
    await db.update(authAccount).set({ password: passwordHash }).where(eq(authAccount.userId, domainUser.authUserId));
  } else {
    const authUserRow = await provisionAuthUser({
      name: opts.name,
      email: opts.email,
      password: opts.password,
      phoneNumber: opts.phone,
    });

    if (domainUser) {
      [domainUser] = await db.update(users).set({ authUserId: authUserRow.id }).where(eq(users.id, domainUser.id)).returning();
    } else {
      [domainUser] = await db
        .insert(users)
        .values({
          phone: opts.phone,
          email: opts.email,
          passwordHash: 'managed-by-better-auth',
          nameEn: opts.name,
          authUserId: authUserRow.id,
        })
        .returning();
    }
  }

  const [existingMembership] = await db.select().from(schoolMemberships).where(eq(schoolMemberships.userId, domainUser.id));
  if (!existingMembership) {
    await db.insert(schoolMemberships).values({ userId: domainUser.id, schoolId: opts.schoolId, role: opts.role, status: 'active' });
  }

  console.log(`Demo login ready: ${opts.email} / ${opts.password}`);
}

async function main() {
  const [school] = await db.select().from(schools).where(eq(schools.slug, 'demo-school'));
  if (!school) throw new Error('Demo school not found - run `pnpm db:seed` first.');

  await ensureLogin({
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_ADMIN_PASSWORD,
    name: 'Demo Admin',
    phone: '+10000099999',
    role: 'admin',
    schoolId: school.id,
  });

  await ensureLogin({
    email: DEMO_TEACHER_EMAIL,
    password: DEMO_TEACHER_PASSWORD,
    name: 'Demo Teacher',
    phone: '+11000099999',
    role: 'teacher',
    schoolId: school.id,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
