import { zValidator } from '@hono/zod-validator';
import { ForbiddenError } from '@monorepo/core';
import {
  announcementReads,
  announcements,
  guardians,
  sections,
  students,
  studentGuardians,
  teachingAssignments,
  withTenantContext,
  type Database,
} from '@monorepo/db';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { enqueueJob } from '../lib/jobs';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });

const audienceSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('school') }),
  z.object({ scope: z.literal('grade'), gradeLevelId: z.string().uuid() }),
  z.object({ scope: z.literal('section'), sectionId: z.string().uuid() }),
]);
type Audience = z.infer<typeof audienceSchema>;

const createSchema = z.object({ title: z.string().min(1), body: z.string().min(1), audience: audienceSchema });
const updateSchema = z.object({ title: z.string().min(1).optional(), body: z.string().min(1).optional() });

/** Admin can target any audience. A teacher may only post to a section they actually teach - never grade/school scope. */
async function assertCanCreateAnnouncement(tenant: TenantContext, audience: Audience, tx: Database): Promise<void> {
  if (tenant.role === 'admin') return;
  if (tenant.role === 'teacher' && audience.scope === 'section') {
    const [assignment] = await tx
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(eq(teachingAssignments.teacherMembershipId, tenant.membershipId), eq(teachingAssignments.sectionId, audience.sectionId))
      );
    if (assignment) return;
  }
  throw new ForbiddenError('Not allowed to post an announcement to this audience');
}

/** The (sectionId, gradeLevelId) pairs relevant to this caller, used to resolve their feed. */
async function callerScopes(tenant: TenantContext, tx: Database): Promise<{ sectionIds: string[]; gradeLevelIds: string[] }> {
  let sectionIds: string[] = [];

  if (tenant.role === 'teacher') {
    const rows = await tx
      .select({ sectionId: teachingAssignments.sectionId })
      .from(teachingAssignments)
      .where(eq(teachingAssignments.teacherMembershipId, tenant.membershipId));
    sectionIds = [...new Set(rows.map((r) => r.sectionId))];
  } else if (tenant.role === 'student') {
    const rows = await tx
      .select({ sectionId: students.sectionId })
      .from(students)
      .where(and(eq(students.userId, tenant.userId), eq(students.schoolId, tenant.schoolId)));
    sectionIds = [...new Set(rows.map((r) => r.sectionId))];
  } else if (tenant.role === 'parent') {
    const rows = await tx
      .select({ sectionId: students.sectionId })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .where(
        and(
          eq(guardians.userId, tenant.userId),
          eq(studentGuardians.schoolId, tenant.schoolId),
          isNotNull(studentGuardians.verifiedAt),
          isNull(studentGuardians.revokedAt)
        )
      );
    sectionIds = [...new Set(rows.map((r) => r.sectionId))];
  }

  const gradeLevelIds =
    sectionIds.length === 0
      ? []
      : [
          ...new Set(
            (await tx.select({ gradeLevelId: sections.gradeLevelId }).from(sections).where(inArray(sections.id, sectionIds))).map(
              (r) => r.gradeLevelId
            )
          ),
        ];

  return { sectionIds, gradeLevelIds };
}

function audienceMatches(audience: unknown, scopes: { sectionIds: string[]; gradeLevelIds: string[] }): boolean {
  const a = audience as Partial<Audience> & { scope?: string };
  if (a?.scope === 'school') return true;
  if (a?.scope === 'grade') return scopes.gradeLevelIds.includes((a as { gradeLevelId: string }).gradeLevelId);
  if (a?.scope === 'section') return scopes.sectionIds.includes((a as { sectionId: string }).sectionId);
  return false;
}

const announcementsRoutes = new Hono<TenantEnv>()
  // Management list: admins see everything in the school; everyone else
  // (teachers) only sees what they themselves authored. This is distinct
  // from /announcements/feed below, which resolves what a caller should
  // *receive* based on their audience membership, not authorship.
  .get('/announcements', async (c) => {
    const tenant = c.get('tenant');
    const { schoolId, userId } = tenant;
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) => {
      const conditions = [eq(announcements.schoolId, schoolId)];
      if (tenant.role !== 'admin') conditions.push(eq(announcements.authorMembershipId, tenant.membershipId));
      return tx.select().from(announcements).where(and(...conditions)).orderBy(desc(announcements.publishedAt));
    });
    return c.json(rows);
  })
  // "My feed": every published announcement whose audience actually
  // includes this caller, given their role (admin: all; teacher: school +
  // their sections' grade/section scopes; student: school + their own
  // section/grade; parent: school + their verified children's
  // sections/grades) - merged with this caller's own read status.
  .get('/announcements/feed', async (c) => {
    const tenant = c.get('tenant');
    const { schoolId, userId } = tenant;

    const feed = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const all = await tx
        .select()
        .from(announcements)
        .where(and(eq(announcements.schoolId, schoolId), isNotNull(announcements.publishedAt)))
        .orderBy(desc(announcements.publishedAt));

      const relevant =
        tenant.role === 'admin' ? all : await (async () => {
          const scopes = await callerScopes(tenant, tx);
          return all.filter((a) => audienceMatches(a.audience, scopes));
        })();

      const reads = await tx
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(and(eq(announcementReads.userId, userId), eq(announcementReads.schoolId, schoolId)));
      const readIds = new Set(reads.map((r) => r.announcementId));

      return relevant.map((a) => ({ ...a, isRead: readIds.has(a.id) }));
    });

    return c.json(feed);
  })
  .post('/announcements', zValidator('json', createSchema), async (c) => {
    const tenant = c.get('tenant');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      await assertCanCreateAnnouncement(tenant, body.audience, tx);
      const [inserted] = await tx
        .insert(announcements)
        .values({
          schoolId,
          authorMembershipId: tenant.membershipId,
          title: body.title,
          body: body.body,
          audience: body.audience,
          publishedAt: new Date(),
        })
        .returning();
      return inserted;
    });
    // Enqueued after the transaction resolves so a rolled-back announcement
    // never generates a notification job for it (same reasoning as the
    // attendance absence notification in attendance.ts).
    await enqueueJob(schoolId, 'notify.announcement', { announcementId: row.id });
    return c.json(row, 201);
  })
  .patch('/announcements/:id', zValidator('param', idParam), zValidator('json', updateSchema), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.schoolId, schoolId)));
      if (!existing) return null;
      if (tenant.role !== 'admin' && existing.authorMembershipId !== tenant.membershipId) {
        throw new ForbiddenError('Only the author or an admin may edit this announcement');
      }
      const [updated] = await tx.update(announcements).set(body).where(eq(announcements.id, id)).returning();
      return updated;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .delete('/announcements/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.schoolId, schoolId)));
      if (!existing) return null;
      if (tenant.role !== 'admin' && existing.authorMembershipId !== tenant.membershipId) {
        throw new ForbiddenError('Only the author or an admin may delete this announcement');
      }
      const [deleted] = await tx.delete(announcements).where(eq(announcements.id, id)).returning();
      return deleted;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok' });
  })
  .post('/announcements/:id/read', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select({ id: announcements.id }).from(announcements).where(and(eq(announcements.id, id), eq(announcements.schoolId, schoolId)));
      if (!existing) return null;
      await tx.insert(announcementReads).values({ schoolId, announcementId: id, userId }).onConflictDoNothing();
      return { id };
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok' });
  });

export default announcementsRoutes;
