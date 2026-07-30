import { pgEnum } from 'drizzle-orm/pg-core';

export const schoolStatusEnum = pgEnum('school_status', [
  'active',
  'trial',
  'suspended',
]);

export const membershipRoleEnum = pgEnum('membership_role', [
  'student',
  'parent',
  'teacher',
  'admin',
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'invited',
  'active',
  'disabled',
]);
