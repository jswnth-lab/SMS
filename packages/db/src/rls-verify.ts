/**
 * Verifies row-level security actually isolates tenants. Connects as the
 * restricted `app_rw` role (not the migration/seed owner, which is a
 * superuser and always bypasses RLS) and checks:
 *
 *   1. No tenant context set  -> queries return zero rows (fail closed)
 *   2. Context set to school A -> only school A's rows are visible
 *   3. Context set to school A, but explicitly filtering by school B's id
 *      -> still zero rows (RLS wins over whatever the app's WHERE clause says)
 *
 * Run with: tsx src/rls-verify.ts
 */
import { eq } from 'drizzle-orm';
import { client as ownerClient, db as ownerDb } from './client';
import { createDb, withTenantContext } from './client';
import { schools, sections, gradeLevels, academicYears, students } from './schema';

const APP_RW_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://app_rw:app_rw_dev_pass@localhost:5433/skldb';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.log(`  ❌ ${message}`);
    failures += 1;
  }
}

async function main() {
  console.log('🔧 Setting up a second tenant (School B) via the owner connection...');
  const [schoolA] = await ownerDb.select().from(schools).limit(1);
  if (!schoolA) throw new Error('Run pnpm db:seed first - no school found.');

  const [schoolB] = await ownerDb
    .insert(schools)
    .values({ name: 'School B (rls-test)', slug: 'rls-test-school-b', status: 'active' })
    .returning();

  const [yearB] = await ownerDb
    .insert(academicYears)
    .values({
      schoolId: schoolB.id,
      name: '2025-2026',
      startsOn: '2025-09-01',
      endsOn: '2026-06-30',
      isCurrent: true,
    })
    .returning();
  const [gradeB] = await ownerDb
    .insert(gradeLevels)
    .values({ schoolId: schoolB.id, name: 'Grade 1', sort: 1 })
    .returning();
  const [sectionB] = await ownerDb
    .insert(sections)
    .values({ schoolId: schoolB.id, gradeLevelId: gradeB.id, academicYearId: yearB.id, name: 'A' })
    .returning();
  await ownerDb.insert(students).values({
    schoolId: schoolB.id,
    admissionNo: 'RLS-TEST-0001',
    nameEn: 'Cross Tenant Test Student',
    dob: '2015-01-01',
    gender: 'male',
    sectionId: sectionB.id,
    joinedOn: '2025-09-01',
  });

  const { db: appDb, client: appClient } = createDb(APP_RW_URL);

  try {
    console.log('\n1) No tenant context set (fail-closed check)');
    const noContext = await appDb.select().from(students);
    assert(noContext.length === 0, `students query with no context returns 0 rows (got ${noContext.length})`);

    console.log('\n2) Context = School A (should only see School A rows)');
    const schoolAStudents = await withTenantContext(appDb, { schoolId: schoolA.id }, (tx) =>
      tx.select().from(students)
    );
    const allFromSchoolA = schoolAStudents.every((s) => s.schoolId === schoolA.id);
    assert(schoolAStudents.length === 60, `sees exactly 60 students (got ${schoolAStudents.length})`);
    assert(allFromSchoolA, 'every visible row belongs to School A');

    console.log('\n3) Context = School A, but explicitly querying for School B\'s id');
    const crossTenantAttempt = await withTenantContext(appDb, { schoolId: schoolA.id }, (tx) =>
      tx.select().from(students).where(eq(students.schoolId, schoolB.id))
    );
    assert(
      crossTenantAttempt.length === 0,
      `explicit WHERE school_id = School B still returns 0 rows (got ${crossTenantAttempt.length})`
    );

    console.log('\n4) Context = School B (sanity check the other direction)');
    const schoolBStudents = await withTenantContext(appDb, { schoolId: schoolB.id }, (tx) =>
      tx.select().from(students)
    );
    assert(schoolBStudents.length === 1, `sees exactly School B's 1 student (got ${schoolBStudents.length})`);
  } finally {
    await appClient.end();
    console.log('\n🧹 Cleaning up School B test data...');
    await ownerDb.delete(students).where(eq(students.schoolId, schoolB.id));
    await ownerDb.delete(sections).where(eq(sections.schoolId, schoolB.id));
    await ownerDb.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolB.id));
    await ownerDb.delete(academicYears).where(eq(academicYears.schoolId, schoolB.id));
    await ownerDb.delete(schools).where(eq(schools.id, schoolB.id));
  }

  console.log(failures === 0 ? '\n✅ All RLS checks passed' : `\n❌ ${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error('❌ RLS verification errored:', error);
    process.exitCode = 1;
  })
  .finally(() => ownerClient.end());
