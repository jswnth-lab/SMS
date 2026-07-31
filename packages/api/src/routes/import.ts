import { requireRole } from '@monorepo/core';
import { db, guardians, sections, students, studentGuardians, users, withTenantContext } from '@monorepo/db';
import type { Database } from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { appDb } from '../db';
import { decodeUpload, parseCsv } from '../lib/csv';
import { validateGuardianRows } from '../lib/import-guardians';
import { validateStudentRows } from '../lib/import-students';
import type { TenantEnv } from '../middleware/tenant-context';

async function extractFileBuffer(c: Context<TenantEnv>): Promise<Buffer | null> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return null;
  }
  const file = body['file'];
  if (!(file instanceof File)) return null;
  return Buffer.from(await file.arrayBuffer());
}

// Both /preview and /confirm re-parse and re-validate the same uploaded
// file rather than caching a parsed payload server-side between calls -
// there's no session/temp-file storage to manage or clean up, and it
// guarantees /confirm never inserts something the caller didn't just see
// validated (no risk of confirming a stale or swapped-out prior upload).
const importRoutes = new Hono<TenantEnv>()
  .post('/import/students/preview', async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const buffer = await extractFileBuffer(c);
    if (!buffer) return c.json({ error: 'file field (multipart/form-data) is required' }, 400);

    const rows = parseCsv(decodeUpload(buffer));
    const { schoolId, userId } = tenant;
    const { existingAdmissionNos, existingSections } = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [studentRows, sectionRows] = await Promise.all([
        tx.select({ admissionNo: students.admissionNo }).from(students).where(eq(students.schoolId, schoolId)),
        tx.select({ id: sections.id, name: sections.name }).from(sections).where(eq(sections.schoolId, schoolId)),
      ]);
      return {
        existingAdmissionNos: new Set(studentRows.map((r) => r.admissionNo)),
        existingSections: sectionRows,
      };
    });

    const { valid, errors } = validateStudentRows(rows, {
      admissionNos: existingAdmissionNos,
      sections: existingSections,
    });
    return c.json({ totalRows: rows.length, validCount: valid.length, errorCount: errors.length, errors, valid });
  })
  .post('/import/students/confirm', async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const buffer = await extractFileBuffer(c);
    if (!buffer) return c.json({ error: 'file field (multipart/form-data) is required' }, 400);

    const rows = parseCsv(decodeUpload(buffer));
    const { schoolId, userId } = tenant;
    const { existingAdmissionNos, existingSections } = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [studentRows, sectionRows] = await Promise.all([
        tx.select({ admissionNo: students.admissionNo }).from(students).where(eq(students.schoolId, schoolId)),
        tx.select({ id: sections.id, name: sections.name }).from(sections).where(eq(sections.schoolId, schoolId)),
      ]);
      return {
        existingAdmissionNos: new Set(studentRows.map((r) => r.admissionNo)),
        existingSections: sectionRows,
      };
    });

    const { valid, errors } = validateStudentRows(rows, {
      admissionNos: existingAdmissionNos,
      sections: existingSections,
    });
    if (errors.length > 0) {
      return c.json(
        { error: 'File has validation errors - fix them and re-upload', totalRows: rows.length, errorCount: errors.length, errors },
        422
      );
    }
    if (valid.length === 0) {
      return c.json({ error: 'No rows to import' }, 400);
    }

    const inserted = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .insert(students)
        .values(
          valid.map((row) => ({
            schoolId,
            admissionNo: row.admissionNo,
            nameEn: row.nameEn,
            nameAr: row.nameAr,
            dob: row.dob,
            gender: row.gender,
            sectionId: row.sectionId,
            joinedOn: row.joinedOn,
          }))
        )
        .returning({ id: students.id })
    );
    return c.json({ inserted: inserted.length });
  })
  // Guardians preview/confirm go through the DB owner connection, not
  // app_rw/withTenantContext: they read and write `users`, and the users
  // RLS policy only lets app_rw see/write a user who is the caller or
  // shares a membership in the current tenant - guardians routinely have
  // neither, so app_rw would silently miss existing guardians (breaking
  // the "reuse by phone" dedup) or fail the insert outright. Same
  // reasoning as guardians.ts. Students import doesn't touch `users`, so it
  // stays on the RLS-enforced path above.
  .post('/import/guardians/preview', async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const buffer = await extractFileBuffer(c);
    if (!buffer) return c.json({ error: 'file field (multipart/form-data) is required' }, 400);

    const rows = parseCsv(decodeUpload(buffer));
    const existing = await loadGuardianImportContext(db, tenant.schoolId);
    const { valid, errors } = validateGuardianRows(rows, existing);
    return c.json({ totalRows: rows.length, validCount: valid.length, errorCount: errors.length, errors, valid });
  })
  .post('/import/guardians/confirm', async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const buffer = await extractFileBuffer(c);
    if (!buffer) return c.json({ error: 'file field (multipart/form-data) is required' }, 400);

    const rows = parseCsv(decodeUpload(buffer));
    const schoolId = tenant.schoolId;
    const existing = await loadGuardianImportContext(db, schoolId);
    const { valid, errors } = validateGuardianRows(rows, existing);
    if (errors.length > 0) {
      return c.json(
        { error: 'File has validation errors - fix them and re-upload', totalRows: rows.length, errorCount: errors.length, errors },
        422
      );
    }
    if (valid.length === 0) {
      return c.json({ error: 'No rows to import' }, 400);
    }

    const linked = await db.transaction(async (tx) => {
      let count = 0;
      for (const row of valid) {
        let guardianId = existing.existingGuardianIdByPhone.get(row.phone);
        if (!guardianId) {
          let [profile] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, row.phone));
          if (!profile) {
            [profile] = await tx
              .insert(users)
              .values({ phone: row.phone, email: row.email, passwordHash: 'no-login-yet', nameEn: row.nameEn })
              .returning({ id: users.id });
          }
          const [guardian] = await tx
            .insert(guardians)
            .values({ schoolId, userId: profile.id })
            .returning({ id: guardians.id });
          guardianId = guardian.id;
          existing.existingGuardianIdByPhone.set(row.phone, guardianId);
        }

        await tx.insert(studentGuardians).values({
          schoolId,
          studentId: row.studentId,
          guardianId,
          relation: row.relation,
          isPrimary: row.isPrimary,
        });
        count += 1;
      }
      return count;
    });
    return c.json({ linked });
  });

async function loadGuardianImportContext(tx: Database, schoolId: string) {
  const [studentRows, linkRows] = await Promise.all([
    tx.select({ id: students.id, admissionNo: students.admissionNo }).from(students).where(eq(students.schoolId, schoolId)),
    tx
      .select({
        studentId: studentGuardians.studentId,
        guardianId: studentGuardians.guardianId,
        phone: users.phone,
      })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .innerJoin(users, eq(users.id, guardians.userId))
      .where(eq(studentGuardians.schoolId, schoolId)),
  ]);

  const studentIdByAdmissionNo = new Map(studentRows.map((r) => [r.admissionNo, r.id]));
  const existingGuardianIdByPhone = new Map(linkRows.map((r) => [r.phone, r.guardianId]));
  const existingLinks = new Set(linkRows.map((r) => `${r.studentId}:${r.guardianId}`));
  return { studentIdByAdmissionNo, existingGuardianIdByPhone, existingLinks };
}

export default importRoutes;
