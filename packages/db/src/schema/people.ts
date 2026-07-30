import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
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
    schoolIdIdx: index('students_school_id_idx').on(table.schoolId),
    userIdIdx: index('students_user_id_idx').on(table.userId),
    sectionIdIdx: index('students_section_id_idx').on(table.sectionId),
    dobBeforeJoinedOn: check(
      'students_dob_before_joined_on',
      sql`${table.dob} < ${table.joinedOn}`
    ),
  })
);

export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    schoolIdIdx: index('guardians_school_id_idx').on(table.schoolId),
    userIdIdx: index('guardians_user_id_idx').on(table.userId),
  })
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('student_guardians_school_id_idx').on(table.schoolId),
    studentIdIdx: index('student_guardians_student_id_idx').on(
      table.studentId
    ),
    guardianIdIdx: index('student_guardians_guardian_id_idx').on(
      table.guardianId
    ),
  })
);

export const teachingAssignments = pgTable(
  'teaching_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('teaching_assignments_school_id_idx').on(
      table.schoolId
    ),
    teacherMembershipIdIdx: index(
      'teaching_assignments_teacher_membership_id_idx'
    ).on(table.teacherMembershipId),
    sectionIdIdx: index('teaching_assignments_section_id_idx').on(
      table.sectionId
    ),
    subjectIdIdx: index('teaching_assignments_subject_id_idx').on(
      table.subjectId
    ),
    academicYearIdIdx: index('teaching_assignments_academic_year_id_idx').on(
      table.academicYearId
    ),
  })
);
