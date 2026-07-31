import { zValidator } from '@hono/zod-validator';
import { canAccessStudent, ForbiddenError } from '@monorepo/core';
import { homework, students, teachingAssignments, withTenantContext, type Database } from '@monorepo/db';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const sectionIdParam = z.object({ sectionId: z.string().uuid() });
const studentIdParam = z.object({ studentId: z.string().uuid() });

const createSchema = z.object({
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attachments: z.array(z.string()).optional(),
});
const updateSchema = createSchema.partial();

/** Admin manages any homework. A teacher may only manage one for a (section, subject) they teach - any academic year, since homework isn't term/year-scoped in the schema. */
async function assertCanManageHomework(tenant: TenantContext, sectionId: string, subjectId: string, tx: Database): Promise<void> {
  if (tenant.role === 'admin') return;
  if (tenant.role === 'teacher') {
    const [assignment] = await tx
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.teacherMembershipId, tenant.membershipId),
          eq(teachingAssignments.sectionId, sectionId),
          eq(teachingAssignments.subjectId, subjectId)
        )
      );
    if (assignment) return;
  }
  throw new ForbiddenError('Not allowed to manage homework for this section/subject');
}

const homeworkRoutes = new Hono<TenantEnv>()
  .get('/homework/sections/:sectionId', zValidator('param', sectionIdParam), async (c) => {
    const { sectionId } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .select()
        .from(homework)
        .where(and(eq(homework.sectionId, sectionId), eq(homework.schoolId, schoolId)))
        .orderBy(desc(homework.dueOn))
    );
    return c.json(rows);
  })
  // Access-checked via canAccessStudent (admin/assigned-teacher/verified-
  // parent/self), same as attendance history - homework for a student is
  // just their section's homework list.
  .get('/homework/students/:studentId', zValidator('param', studentIdParam), async (c) => {
    const tenant = c.get('tenant');
    const { studentId } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const allowed = await canAccessStudent(tenant, studentId, tx);
      if (!allowed) throw new ForbiddenError('Not allowed to view this student’s homework');

      const [student] = await tx.select({ sectionId: students.sectionId }).from(students).where(and(eq(students.id, studentId), eq(students.schoolId, schoolId)));
      if (!student) return null;
      return tx
        .select()
        .from(homework)
        .where(and(eq(homework.sectionId, student.sectionId), eq(homework.schoolId, schoolId)))
        .orderBy(desc(homework.dueOn));
    });
    if (!result) return c.json({ error: 'Student not found' }, 404);
    return c.json(result);
  })
  .post('/homework', zValidator('json', createSchema), async (c) => {
    const tenant = c.get('tenant');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      await assertCanManageHomework(tenant, body.sectionId, body.subjectId, tx);
      const [inserted] = await tx
        .insert(homework)
        .values({
          schoolId,
          sectionId: body.sectionId,
          subjectId: body.subjectId,
          teacherMembershipId: tenant.membershipId,
          title: body.title,
          body: body.body,
          dueOn: body.dueOn,
          attachments: body.attachments ?? [],
        })
        .returning();
      return inserted;
    });
    return c.json(row, 201);
  })
  .patch('/homework/:id', zValidator('param', idParam), zValidator('json', updateSchema), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select().from(homework).where(and(eq(homework.id, id), eq(homework.schoolId, schoolId)));
      if (!existing) return null;
      const merged = { sectionId: body.sectionId ?? existing.sectionId, subjectId: body.subjectId ?? existing.subjectId };
      await assertCanManageHomework(tenant, merged.sectionId, merged.subjectId, tx);
      const [updated] = await tx.update(homework).set(body).where(eq(homework.id, id)).returning();
      return updated;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .delete('/homework/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select().from(homework).where(and(eq(homework.id, id), eq(homework.schoolId, schoolId)));
      if (!existing) return null;
      await assertCanManageHomework(tenant, existing.sectionId, existing.subjectId, tx);
      const [deleted] = await tx.delete(homework).where(eq(homework.id, id)).returning();
      return deleted;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok' });
  });

export default homeworkRoutes;
