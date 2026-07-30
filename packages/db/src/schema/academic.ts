import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { schoolMemberships, schools } from './tenancy';

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolNameUnique: unique('academic_years_school_name_unique').on(
      table.schoolId,
      table.name
    ),
    schoolIdIdx: index('academic_years_school_id_idx').on(table.schoolId),
    datesSane: check(
      'academic_years_dates_sane',
      sql`${table.endsOn} > ${table.startsOn}`
    ),
  })
);

export const terms = pgTable(
  'terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id),
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolIdIdx: index('terms_school_id_idx').on(table.schoolId),
    academicYearIdIdx: index('terms_academic_year_id_idx').on(
      table.academicYearId
    ),
    datesSane: check(
      'terms_dates_sane',
      sql`${table.endsOn} > ${table.startsOn}`
    ),
  })
);

export const gradeLevels = pgTable(
  'grade_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    name: text('name').notNull(),
    sort: integer('sort').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolNameUnique: unique('grade_levels_school_name_unique').on(
      table.schoolId,
      table.name
    ),
    schoolIdIdx: index('grade_levels_school_id_idx').on(table.schoolId),
  })
);

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    gradeLevelId: uuid('grade_level_id')
      .notNull()
      .references(() => gradeLevels.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id),
    name: text('name').notNull(),
    homeroomTeacherMembershipId: uuid('homeroom_teacher_membership_id').references(
      () => schoolMemberships.id
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    gradeYearNameUnique: unique('sections_grade_level_year_name_unique').on(
      table.gradeLevelId,
      table.academicYearId,
      table.name
    ),
    schoolIdIdx: index('sections_school_id_idx').on(table.schoolId),
    gradeLevelIdIdx: index('sections_grade_level_id_idx').on(
      table.gradeLevelId
    ),
    academicYearIdIdx: index('sections_academic_year_id_idx').on(
      table.academicYearId
    ),
    homeroomTeacherMembershipIdIdx: index(
      'sections_homeroom_teacher_membership_id_idx'
    ).on(table.homeroomTeacherMembershipId),
  })
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    code: text('code').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolCodeUnique: unique('subjects_school_code_unique').on(
      table.schoolId,
      table.code
    ),
    schoolIdIdx: index('subjects_school_id_idx').on(table.schoolId),
  })
);
