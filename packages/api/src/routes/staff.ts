import { requireRole } from '@monorepo/core';
import { schoolMemberships, users, withTenantContext } from '@monorepo/db';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { appDb } from '../db';
import type { TenantEnv } from '../middleware/tenant-context';

// Admin-only: there's no per-role restriction to relax here (unlike
// students/sections, which teachers can see a scoped slice of) - who's on
// staff is management information, not something a teacher needs to query.
const staffRoutes = new Hono<TenantEnv>().get('/staff', async (c) => {
  const tenant = c.get('tenant');
  requireRole('admin')(tenant);
  const { schoolId, userId } = tenant;

  const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
    tx
      .select({
        membershipId: schoolMemberships.id,
        role: schoolMemberships.role,
        status: schoolMemberships.status,
        createdAt: schoolMemberships.createdAt,
        userId: users.id,
        nameEn: users.nameEn,
        nameAr: users.nameAr,
        phone: users.phone,
        email: users.email,
      })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(and(eq(schoolMemberships.schoolId, schoolId), inArray(schoolMemberships.role, ['admin', 'teacher'])))
  );

  return c.json(rows);
});

export default staffRoutes;
