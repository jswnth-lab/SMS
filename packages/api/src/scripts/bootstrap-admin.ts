// One-off dev helper: gives the seeded admin (packages/db/src/seed.ts) a
// real login. Not part of the invite system - someone has to be the first
// admin before there's anyone around to invite them. Uses the exact same
// provisionAuthUser() path invite-accept uses, just triggered manually.
import { db, users } from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { provisionAuthUser } from '../auth-provisioning';

async function main() {
  const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
  if (!admin) throw new Error('Seeded admin not found - run pnpm db:seed first.');
  if (admin.authUserId) {
    console.log('Admin already has a login.');
    return;
  }

  const password = process.argv[2];
  if (!password) throw new Error('Usage: tsx src/scripts/bootstrap-admin.ts <password>');

  const authUserRow = await provisionAuthUser({
    name: admin.nameEn,
    email: admin.email!,
    password,
    phoneNumber: admin.phone,
  });
  await db.update(users).set({ authUserId: authUserRow.id }).where(eq(users.id, admin.id));
  console.log(`Admin login created: ${admin.email} / (password you passed in)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
