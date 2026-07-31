import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  auditLogs,
  db,
  gradeLevels,
  guardians,
  schoolMemberships,
  schools,
  sections,
  studentGuardians,
  students,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import iconv from 'iconv-lite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../middleware/audit-log';
import type { TenantEnv } from '../middleware/tenant-context';
import importRoutes from './import';

describe('CSV import (students + guardians)', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let sectionId: string;
  let sectionName: string;

  function buildApp() {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', { userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
        await next();
      })
      .use('*', auditLog())
      .route('/', importRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
        throw err;
      });
  }

  function upload(path: string, buffer: Buffer, filename = 'upload.csv') {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    return buildApp().request(path, { method: 'POST', body: form });
  }

  beforeAll(async () => {
    const suffix = `vitest-import-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Import Test School ${suffix}`, slug: `import-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+6000${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
      .returning();
    adminUserId = adminUser.id;

    const [adminMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'admin', status: 'active' })
      .returning();
    adminMembershipId = adminMembership.id;

    const [ay] = await db
      .insert(academicYears)
      .values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();
    const [gl] = await db.insert(gradeLevels).values({ schoolId, name: `Grade ${suffix}`, sort: 1 }).returning();
    sectionName = `A ${suffix}`;
    const [section] = await db
      .insert(sections)
      .values({ schoolId, gradeLevelId: gl.id, academicYearId: ay.id, name: sectionName })
      .returning();
    sectionId = section.id;
  });

  afterAll(async () => {
    const guardianRows = await db
      .select({ userId: guardians.userId })
      .from(guardians)
      .where(eq(guardians.schoolId, schoolId));

    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(studentGuardians).where(eq(studentGuardians.schoolId, schoolId));
    await db.delete(guardians).where(eq(guardians.schoolId, schoolId));
    await db.delete(students).where(eq(students.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, ...guardianRows.map((r) => r.userId)]));
  });

  it('reports row-level errors for a deliberately messy students file without inserting anything', async () => {
    // Deliberately messy: a UTF-8 BOM, an Arabic name column encoded as
    // Windows-1256 (the common Excel-on-Windows Arabic export encoding),
    // extra trailing columns the schema doesn't know about, a fully blank
    // line, a duplicate admission_no within the file itself, a bad gender
    // value, and dob >= joined_on.
    const csvText =
      `admission_no,name_en,name_ar,dob,gender,section_id,joined_on,extra_col_1,extra_col_2\n` +
      `IMP-1,Ahmed Ali,,2015-01-01,male,${sectionId},2024-01-01,ignored,also ignored\n` +
      `\n` +
      `IMP-2,Sara Ahmed,مرحبا,2015-01-01,female,${sectionId},2024-01-01,,\n` +
      `IMP-2,Duplicate Row,,2015-01-01,female,${sectionId},2024-01-01,,\n` +
      `IMP-3,Bad Gender,,2015-01-01,unknown,${sectionId},2024-01-01,,\n` +
      `IMP-4,Bad Dates,,2025-01-01,male,${sectionId},2024-01-01,,\n`;

    const bomBytes = Buffer.from([0xef, 0xbb, 0xbf]);
    const utf8Body = Buffer.from(csvText, 'utf8');
    // Re-encode just the nameAr value's line as Windows-1256 by encoding the
    // whole file in win1256 (simulating "Excel saved this as Arabic Windows
    // CSV") - the BOM branch below takes priority, so build two variants:
    // one BOM+UTF8 (rows 1/3/4/5 exercise extra columns/blank/dup/bad
    // gender/bad dates), and confirm the win1256 fallback separately.
    const buffer = Buffer.concat([bomBytes, utf8Body]);

    const res = await upload('/import/students/preview', buffer);
    expect(res.status).toBe(200);
    const report = (await res.json()) as {
      totalRows: number;
      validCount: number;
      errorCount: number;
      errors: { line: number; field?: string; message: string }[];
    };

    // Blank line was skipped entirely (not counted as a row), extra columns
    // were ignored without error.
    expect(report.totalRows).toBe(5);
    expect(report.validCount).toBe(2); // IMP-1 and IMP-2 (first occurrence)
    expect(report.errorCount).toBeGreaterThan(0);

    const messages = report.errors.map((e) => e.message).join(' | ');
    expect(messages).toContain('duplicate admission_no');
    expect(messages.toLowerCase()).toContain('gender');
    expect(messages).toContain('dob must be before joined_on');

    // Confirm refuses to insert anything while the file still has errors.
    const confirmRes = await upload('/import/students/confirm', buffer);
    expect(confirmRes.status).toBe(422);

    const inDb = await db.select().from(students).where(eq(students.schoolId, schoolId));
    expect(inDb).toHaveLength(0);
  });

  it('decodes a Windows-1256 (non-UTF-8) file with real Arabic text correctly', async () => {
    // The whole file has no valid-UTF-8 signal at all (every byte is
    // win1256), so decodeUpload's fallback must engage for the file to be
    // readable at all - a naive UTF-8-only decoder would mangle this.
    const csvText =
      `admission_no,name_en,name_ar,dob,gender,section_id,joined_on\n` +
      `WIN-1,Good Row,مرحبا,2015-01-01,male,${sectionId},2024-01-01\n`;
    const buffer = iconv.encode(csvText, 'win1256');

    const res = await upload('/import/students/preview', buffer);
    expect(res.status).toBe(200);
    const report = (await res.json()) as {
      errorCount: number;
      valid: { admissionNo: string; nameAr: string | null }[];
    };
    expect(report.errorCount).toBe(0);
    expect(report.valid.find((r) => r.admissionNo === 'WIN-1')?.nameAr).toBe('مرحبا');
  });

  it('flags a name_ar field that already contains the mojibake replacement character', async () => {
    // Simulates the actual failure signature of a mismatched encoding
    // reaching us: whatever upstream tool produced the file already
    // replaced unmappable Arabic bytes with U+FFFD before we ever see it
    // (a very common outcome of a naive encoding conversion). The file
    // itself is clean UTF-8 - decodeUpload has nothing to fall back on -
    // so this exercises the validator's own mojibake check, not the
    // encoding-sniffing heuristic.
    const csvText =
      `admission_no,name_en,name_ar,dob,gender,section_id,joined_on\n` +
      `BAD-AR,Bad Arabic Row,���,2015-01-01,male,${sectionId},2024-01-01\n`;
    const buffer = Buffer.from(csvText, 'utf8');

    const res = await upload('/import/students/preview', buffer);
    expect(res.status).toBe(200);
    const report = (await res.json()) as { errors: { line: number; field?: string; message: string }[] };
    expect(report.errors.some((e) => e.field === 'nameAr' && e.message.includes('unreadable characters'))).toBe(true);
  });

  it('confirms a clean students file and actually inserts rows', async () => {
    const csvText =
      `admission_no,name_en,dob,gender,section_name,joined_on\n` +
      `CLEAN-1,Clean Row One,2015-01-01,male,${sectionName},2024-01-01\n` +
      `CLEAN-2,Clean Row Two,2015-01-01,female,${sectionName},2024-01-01\n`;
    const buffer = Buffer.from(csvText, 'utf8');

    const previewRes = await upload('/import/students/preview', buffer);
    expect(((await previewRes.json()) as { errorCount: number }).errorCount).toBe(0);

    const confirmRes = await upload('/import/students/confirm', buffer);
    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()) as { inserted: number }).toEqual({ inserted: 2 });

    const inDb = await db
      .select()
      .from(students)
      .where(eq(students.schoolId, schoolId));
    expect(inDb.map((s) => s.admissionNo).sort()).toEqual(['CLEAN-1', 'CLEAN-2']);
  });

  it('imports guardians, reuses an existing guardian by phone for a second child, and flags an already-linked duplicate', async () => {
    const csvText =
      `guardian_name,guardian_phone,relation,student_admission_no\n` +
      `Parent One,+7000-shared,father,CLEAN-1\n` +
      `Parent One,+7000-shared,father,CLEAN-2\n`; // same phone, different child - should reuse the guardian
    const buffer = Buffer.from(csvText, 'utf8');

    const previewRes = await upload('/import/guardians/preview', buffer);
    const preview = (await previewRes.json()) as { errorCount: number; validCount: number };
    expect(preview.errorCount).toBe(0);
    expect(preview.validCount).toBe(2);

    const confirmRes = await upload('/import/guardians/confirm', buffer);
    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()) as { linked: number }).toEqual({ linked: 2 });

    const guardianRows = await db
      .select()
      .from(guardians)
      .innerJoin(users, eq(users.id, guardians.userId))
      .where(eq(users.phone, '+7000-shared'));
    expect(guardianRows).toHaveLength(1); // one guardian, not two, despite two rows

    // Re-uploading the same file again should now flag both rows as
    // already-linked duplicates instead of creating a second link.
    const secondPreviewRes = await upload('/import/guardians/preview', buffer);
    const secondPreview = (await secondPreviewRes.json()) as {
      errorCount: number;
      errors: { message: string }[];
    };
    expect(secondPreview.errorCount).toBe(2);
    expect(secondPreview.errors.every((e) => e.message.includes('already linked'))).toBe(true);
  });
});
