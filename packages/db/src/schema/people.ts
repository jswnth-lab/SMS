import {
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { academicYears, sections, subjects } from './academic';
import {
  genderEnum,
  guardianRelationEnum,
  studentStatusEnum,
} from './enums';
import { schoolMemberships, schools, users } from './tenancy';

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id').references(() => users.id),
    admissionNo: text('admission_no').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    dob: date('dob').notNull(),
    gender: genderEnum('gender').notNull(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id),
    status: studentStatusEnum('status').notNull().default('active'),
    joinedOn: date('joined_on').notNull(),
    meta: jsonb('meta').notNull().default({}),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolAdmissionNoUnique: unique('students_school_admission_no_unique').on(
      table.schoolId,
      table.admissionNo
    ),
  })
);

export const guardians = pgTable('guardians', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id),
    relation: guardianRelationEnum('relation').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    studentGuardianUnique: unique('student_guardians_student_guardian_unique').on(
      table.studentId,
      table.guardianId
    ),
  })
);

export const teachingAssignments = pgTable(
  'teaching_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherMembershipId: uuid('teacher_membership_id')
      .notNull()
      .references(() => schoolMemberships.id),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    assignmentUnique: unique('teaching_assignments_unique_combo').on(
      table.teacherMembershipId,
      table.sectionId,
      table.subjectId,
      table.academicYearId
    ),
  })
);
