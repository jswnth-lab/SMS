import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { db, guardians, students, studentGuardians, users, withTenantContext } from '@monorepo/db';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const studentIdParam = z.object({ studentId: z.string().uuid() });

// A guardian may not be an authenticated user yet (no login access), so
// creating one either points at an existing domain users.id or creates a
// bare profile inline - same "profile can predate login" pattern as
// students.userId (see schema/people.ts).
const createSchema = z
  .object({
    userId: z.string().uuid().optional(),
    nameEn: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().nullish(),
  })
  .refine((body) => body.userId || (body.nameEn && body.phone), {
    message: 'Provide either userId, or nameEn and phone to create a new profile',
  });

const linkSchema = z.object({
  guardianId: z.string().uuid(),
  relation: z.enum(['father', 'mother', 'guardian', 'other']),
  isPrimary: z.boolean().optional(),
});

const guardiansRoutes = new Hono<TenantEnv>()
  // These two routes go through the DB owner connection, not app_rw: the
  // users RLS policy only lets app_rw see/write a user who is either the
  // caller themself or shares a school_membership in the current tenant -
  // guardians routinely have no membership at all, so app_rw would either
  // fail to insert (WITH CHECK) or silently see zero rows on lookup. Same
  // reasoning as invites.ts/auth-provisioning.ts for any operation that
  // touches `users` directly. schoolId is still applied explicitly as a
  // filter, so this isn't "no tenant scoping" - just not RLS-enforced.
  .get('/guardians/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId } = c.get('tenant');
    const [row] = await db.select().from(guardians).where(and(eq(guardians.id, id), eq(guardians.schoolId, schoolId)));
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .post('/guardians', zValidator('json', createSchema), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const body = c.req.valid('json');
    try {
      const [row] = await db.transaction(async (tx) => {
        let guardianUserId = body.userId;
        if (!guardianUserId) {
          const [profile] = await tx
            .insert(users)
            .values({
              phone: body.phone!,
              email: body.email,
              passwordHash: 'no-login-yet',
              nameEn: body.nameEn!,
            })
            .returning();
          guardianUserId = profile.id;
        }
        return tx.insert(guardians).values({ schoolId: tenant.schoolId, userId: guardianUserId }).returning();
      });
      return c.json(row, 201);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  // Links an existing guardian to an existing student. Unverified by
  // default - verify() is a separate, explicit step (see below) so a
  // guardian claim never grants access until the school confirms it.
  .post('/students/:studentId/guardians', zValidator('param', studentIdParam), zValidator('json', linkSchema), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { studentId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.id, studentId), eq(students.schoolId, tenant.schoolId)));
        if (!student) return [undefined];
        return tx
          .insert(studentGuardians)
          .values({
            schoolId: tenant.schoolId,
            studentId,
            guardianId: body.guardianId,
            relation: body.relation,
            isPrimary: body.isPrimary ?? false,
          })
          .returning();
      });
      if (!row) return c.json({ error: 'Student not found' }, 404);
      return c.json(row, 201);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  .get('/students/:studentId/guardians', zValidator('param', studentIdParam), async (c) => {
    const { studentId } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .select()
        .from(studentGuardians)
        .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.schoolId, schoolId)))
    );
    return c.json(rows);
  })
  .post('/student-guardians/:id/verify', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
      tx
        .update(studentGuardians)
        .set({ verifiedAt: new Date() })
        .where(and(eq(studentGuardians.id, id), eq(studentGuardians.schoolId, tenant.schoolId)))
        .returning()
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .post('/student-guardians/:id/revoke', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
      tx
        .update(studentGuardians)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(studentGuardians.id, id),
            eq(studentGuardians.schoolId, tenant.schoolId),
            isNull(studentGuardians.revokedAt)
          )
        )
        .returning()
    );
    if (!row) return c.json({ error: 'Not found, or already revoked' }, 404);
    return c.json(row);
  });

export default guardiansRoutes;
