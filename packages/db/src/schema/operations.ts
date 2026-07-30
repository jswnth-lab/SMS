import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sections, subjects, terms } from './academic';
import {
  attendanceStatusEnum,
  reportCardStatusEnum,
} from './enums';
import { schoolMemberships, schools, users } from './tenancy';
import { students } from './people';

export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id),
    dayOfWeek: integer('day_of_week').notNull(),
    periodNo: integer('period_no').notNull(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    teacherMembershipId: uuid('teacher_membership_id')
      .notNull()
      .references(() => schoolMemberships.id),
    room: text('room'),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sectionSlotUnique: unique('timetable_slots_section_day_period_unique').on(
      table.sectionId,
      table.dayOfWeek,
      table.periodNo
    ),
  })
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    date: date('date').notNull(),
    periodNo: integer('period_no'),
    status: attendanceStatusEnum('status').notNull(),
    markedByMembershipId: uuid('marked_by_membership_id')
      .notNull()
      .references(() => schoolMemberships.id),
    markedAt: timestamp('marked_at').defaultNow().notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    studentDatePeriodUnique: unique(
      'attendance_records_student_date_period_unique'
    ).on(table.studentId, table.date, table.periodNo),
  })
);

export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => sections.id),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id),
  termId: uuid('term_id')
    .notNull()
    .references(() => terms.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  maxMarks: numeric('max_marks').notNull(),
  weight: numeric('weight').notNull(),
  date: date('date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    score: numeric('score').notNull(),
    remark: text('remark'),
    enteredBy: uuid('entered_by')
      .notNull()
      .references(() => schoolMemberships.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    assessmentStudentUnique: unique('marks_assessment_student_unique').on(
      table.assessmentId,
      table.studentId
    ),
  })
);

export const reportCards = pgTable(
  'report_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id),
    status: reportCardStatusEnum('status').notNull().default('draft'),
    pdfUrl: text('pdf_url'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    studentTermUnique: unique('report_cards_student_term_unique').on(
      table.studentId,
      table.termId
    ),
  })
);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  authorMembershipId: uuid('author_membership_id')
    .notNull()
    .references(() => schoolMemberships.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: jsonb('audience').notNull().default({}),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    readAt: timestamp('read_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.announcementId, table.userId] }),
  })
);

export const homework = pgTable('homework', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => sections.id),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id),
  teacherMembershipId: uuid('teacher_membership_id')
    .notNull()
    .references(() => schoolMemberships.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  dueOn: date('due_on').notNull(),
  attachments: jsonb('attachments').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  channels: jsonb('channels').notNull().default([]),
  sentAt: timestamp('sent_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  diff: jsonb('diff').notNull().default({}),
  at: timestamp('at').defaultNow().notNull(),
});
