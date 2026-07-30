import {
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
  })
);
