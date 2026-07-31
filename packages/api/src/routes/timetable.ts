import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { sections, timetableSlots, withTenantContext } from '@monorepo/db';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const sectionIdParam = z.object({ sectionId: z.string().uuid() });
const teacherIdParam = z.object({ teacherMembershipId: z.string().uuid() });

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  periodNo: z.number().int().min(1),
  subjectId: z.string().uuid(),
  teacherMembershipId: z.string().uuid(),
  room: z.string().nullish(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

const bulkUpsertSchema = z.object({ slots: z.array(slotSchema).min(1) });

interface Conflict {
  dayOfWeek: number;
  periodNo: number;
  type: 'duplicate_in_batch' | 'teacher_double_booked' | 'room_double_booked';
  message: string;
}

const timetableRoutes = new Hono<TenantEnv>()
  .get('/timetable/sections/:sectionId', zValidator('param', sectionIdParam), async (c) => {
    const { sectionId } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .select()
        .from(timetableSlots)
        .where(and(eq(timetableSlots.sectionId, sectionId), eq(timetableSlots.schoolId, schoolId)))
        .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.periodNo))
    );
    return c.json(rows);
  })
  .get('/timetable/teachers/:teacherMembershipId', zValidator('param', teacherIdParam), async (c) => {
    const { teacherMembershipId } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .select()
        .from(timetableSlots)
        .where(and(eq(timetableSlots.teacherMembershipId, teacherMembershipId), eq(timetableSlots.schoolId, schoolId)))
        .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.periodNo))
    );
    return c.json(rows);
  })
  // Bulk upsert: replaces this section's ENTIRE weekly timetable in one
  // call (delete-then-insert in a single transaction), not a per-slot
  // merge - the caller sends the full desired schedule, not a diff.
  // Nothing is written if any conflict is found first.
  .post(
    '/timetable/sections/:sectionId',
    zValidator('param', sectionIdParam),
    zValidator('json', bulkUpsertSchema),
    async (c) => {
      const tenant = c.get('tenant');
      requireRole('admin')(tenant);
      const { sectionId } = c.req.valid('param');
      const { slots } = c.req.valid('json');
      const { schoolId, userId } = tenant;

      const conflicts: Conflict[] = [];

      // Duplicate (dayOfWeek, periodNo) within the submitted batch itself -
      // would otherwise hit the DB's unique constraint on insert.
      const seen = new Map<string, number>();
      for (const slot of slots) {
        const key = `${slot.dayOfWeek}:${slot.periodNo}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      for (const slot of slots) {
        const key = `${slot.dayOfWeek}:${slot.periodNo}`;
        if (seen.get(key)! > 1) {
          conflicts.push({
            dayOfWeek: slot.dayOfWeek,
            periodNo: slot.periodNo,
            type: 'duplicate_in_batch',
            message: `day ${slot.dayOfWeek} period ${slot.periodNo} appears more than once in this submission`,
          });
        }
      }

      // Cross-section conflicts: does any OTHER section already have a slot
      // at the same (dayOfWeek, periodNo) with the same teacher, or the
      // same room? Fetched once for the whole school and filtered in
      // memory rather than one query per slot - a school's full timetable
      // is small enough that this is simpler and still fast.
      const otherSectionSlots = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
        tx
          .select()
          .from(timetableSlots)
          .where(and(eq(timetableSlots.schoolId, schoolId), ne(timetableSlots.sectionId, sectionId)))
      );

      for (const slot of slots) {
        const sameSlot = otherSectionSlots.filter(
          (o) => o.dayOfWeek === slot.dayOfWeek && o.periodNo === slot.periodNo
        );
        const teacherConflict = sameSlot.find((o) => o.teacherMembershipId === slot.teacherMembershipId);
        if (teacherConflict) {
          conflicts.push({
            dayOfWeek: slot.dayOfWeek,
            periodNo: slot.periodNo,
            type: 'teacher_double_booked',
            message: `teacher is already scheduled for another section at day ${slot.dayOfWeek} period ${slot.periodNo}`,
          });
        }
        if (slot.room) {
          const roomConflict = sameSlot.find((o) => o.room === slot.room);
          if (roomConflict) {
            conflicts.push({
              dayOfWeek: slot.dayOfWeek,
              periodNo: slot.periodNo,
              type: 'room_double_booked',
              message: `room "${slot.room}" is already in use by another section at day ${slot.dayOfWeek} period ${slot.periodNo}`,
            });
          }
        }
      }

      if (conflicts.length > 0) {
        return c.json({ error: 'Timetable conflicts found - nothing was saved', conflicts }, 409);
      }

      try {
        const inserted = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
          const [section] = await tx
            .select({ id: sections.id })
            .from(sections)
            .where(and(eq(sections.id, sectionId), eq(sections.schoolId, schoolId)));
          if (!section) return null;

          await tx.delete(timetableSlots).where(eq(timetableSlots.sectionId, sectionId));
          return tx
            .insert(timetableSlots)
            .values(slots.map((slot) => ({ ...slot, schoolId, sectionId })))
            .returning();
        });
        if (!inserted) return c.json({ error: 'Section not found' }, 404);
        return c.json(inserted);
      } catch (err) {
        return handleDbError(c, err);
      }
    }
  );

export default timetableRoutes;
