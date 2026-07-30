import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  membershipRoleEnum,
  membershipStatusEnum,
  schoolStatusEnum,
} from './enums';
import { authUser } from './auth';

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  localeDefault: text('locale_default').notNull().default('en'),
  settings: jsonb('settings').notNull().default({}),
  status: schoolStatusEnum('status').notNull().default('trial'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  email: text('email').unique(),
  passwordHash: text('password_hash').notNull(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  locale: text('locale').notNull().default('en'),
  avatarUrl: text('avatar_url'),
  // Links this domain profile to its better-auth identity (packages/db/src/schema/auth.ts).
  // Nullable: not every profile (e.g. a student with no portal access yet) has
  // logged in / been provisioned an auth account.
  authUserId: text('auth_user_id').unique().references(() => authUser.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const schoolMemberships = pgTable(
  'school_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    role: membershipRoleEnum('role').notNull(),
    status: membershipStatusEnum('status').notNull().default('invited'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userSchoolRoleUnique: unique('school_memberships_user_school_role_unique').on(
      table.userId,
      table.schoolId,
      table.role
    ),
    schoolIdIdx: index('school_memberships_school_id_idx').on(table.schoolId),
    userIdIdx: index('school_memberships_user_id_idx').on(table.userId),
  })
);
