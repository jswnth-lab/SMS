import {
  academicYears,
  db,
  gradeLevels,
  guardians,
  jobs,
  notifications,
  schools,
  sections,
  studentGuardians,
  students,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { executeJob } from './job-handlers';
import { claimPendingJobs, completeJob, enqueueJob, failJob } from './jobs';

describe('jobs worker pipeline', () => {
  const suffix = Date.now();
  const schoolIds: string[] = [];
  let studentId: string;
  let guardianUserId: string;
  let guardianId: string;

  async function makeSchool(label: string) {
    const [{ id }] = await db
      .insert(schools)
      .values({ name: `Jobs ${label} School ${suffix}`, slug: `jobs-${label}-${suffix}` })
      .returning({ id: schools.id });
    schoolIds.push(id);
    return id;
  }

  it('enqueues, claims, and executes a notify.absence job, writing a real notification and marking the job completed', async () => {
    const schoolId = await makeSchool('absence');

    [{ id: guardianUserId }] = await db
      .insert(users)
      .values({ phone: `+1000${suffix}`, passwordHash: 'x', nameEn: `Jobs Guardian ${suffix}` })
      .returning({ id: users.id });

    [{ id: guardianId }] = await db
      .insert(guardians)
      .values({ userId: guardianUserId, schoolId })
      .returning({ id: guardians.id });

    const [ay] = await db
      .insert(academicYears)
      .values({ schoolId, name: `Jobs AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();
    const [gl] = await db.insert(gradeLevels).values({ schoolId, name: `Jobs Grade ${suffix}`, sort: 1 }).returning();
    const [section] = await db
      .insert(sections)
      .values({ schoolId, gradeLevelId: gl.id, academicYearId: ay.id, name: `Jobs Section ${suffix}` })
      .returning();

    [{ id: studentId }] = await db
      .insert(students)
      .values({
        schoolId,
        sectionId: section.id,
        admissionNo: `JOB-${suffix}`,
        nameEn: 'Test Student',
        dob: '2015-01-01',
        gender: 'male',
        joinedOn: '2025-09-01',
      })
      .returning({ id: students.id });

    await db.insert(studentGuardians).values({
      schoolId,
      studentId,
      guardianId,
      relation: 'guardian',
      verifiedAt: new Date(),
    });

    const { id: jobId } = await enqueueJob(schoolId, 'notify.absence', {
      schoolId,
      studentId,
      attendanceRecordId: '00000000-0000-0000-0000-000000000001',
      date: '2026-02-01',
    });

    const claimed = await claimPendingJobs(10);
    const ourJob = claimed.find((j) => j.id === jobId);
    expect(ourJob).toBeDefined();
    expect(ourJob!.status).toBe('processing');

    await executeJob(ourJob!.id, ourJob!.type, ourJob!.payload);

    const [finished] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(finished.status).toBe('completed');
    expect(finished.result).toMatchObject({ notificationsCreated: 1 });

    const notifRows = await db.select().from(notifications).where(eq(notifications.userId, guardianUserId));
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0]).toMatchObject({ type: 'attendance.absence' });
  });

  it('fails a job permanently once attempts reach maxAttempts', async () => {
    const schoolId = await makeSchool('fail');
    const { id: jobId } = await enqueueJob(schoolId, 'notify.announcement', {
      announcementId: '00000000-0000-0000-0000-000000000002',
    });

    await db.update(jobs).set({ attempts: 2, maxAttempts: 3 }).where(eq(jobs.id, jobId));
    const failed = await failJob(jobId, 'boom');
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toBe('boom');
  });

  it('schedules a retry with nextRetryAt when attempts remain', async () => {
    const schoolId = await makeSchool('retry');
    const { id: jobId } = await enqueueJob(schoolId, 'notify.announcement', {
      announcementId: '00000000-0000-0000-0000-000000000003',
    });

    const retried = await failJob(jobId, 'transient error');
    expect(retried!.status).toBe('pending');
    expect(retried!.attempts).toBe(1);
    expect(retried!.nextRetryAt).not.toBeNull();
    expect(retried!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not claim a job whose nextRetryAt is still in the future', async () => {
    const schoolId = await makeSchool('notyet');
    const { id: jobId } = await enqueueJob(schoolId, 'notify.announcement', {
      announcementId: '00000000-0000-0000-0000-000000000004',
    });
    await db
      .update(jobs)
      .set({ status: 'pending', nextRetryAt: new Date(Date.now() + 60_000) })
      .where(eq(jobs.id, jobId));

    const claimed = await claimPendingJobs(10);
    expect(claimed.find((j) => j.id === jobId)).toBeUndefined();
  });

  it('marks a job completed via completeJob with a result payload', async () => {
    const schoolId = await makeSchool('complete');
    const { id: jobId } = await enqueueJob(schoolId, 'pdf.report-card', {
      reportCardId: '00000000-0000-0000-0000-000000000005',
    });

    const completed = await completeJob(jobId, { pdfUrl: 's3://x' });
    expect(completed!.status).toBe('completed');
    expect(completed!.result).toMatchObject({ pdfUrl: 's3://x' });
    expect(completed!.completedAt).not.toBeNull();
  });

  afterAll(async () => {
    await db.delete(notifications).where(eq(notifications.type, 'attendance.absence'));
    if (guardianId) await db.delete(studentGuardians).where(eq(studentGuardians.guardianId, guardianId));
    if (guardianId) await db.delete(guardians).where(eq(guardians.id, guardianId));
    if (studentId) await db.delete(students).where(eq(students.id, studentId));
    if (guardianUserId) await db.delete(users).where(eq(users.id, guardianUserId));
    if (schoolIds.length > 0) {
      await db.delete(jobs).where(inArray(jobs.schoolId, schoolIds));
      await db.delete(sections).where(inArray(sections.schoolId, schoolIds));
      await db.delete(gradeLevels).where(inArray(gradeLevels.schoolId, schoolIds));
      await db.delete(academicYears).where(inArray(academicYears.schoolId, schoolIds));
      await db.delete(schools).where(inArray(schools.id, schoolIds));
    }
  });
});
