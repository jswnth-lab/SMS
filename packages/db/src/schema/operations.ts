import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
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
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('timetable_slots_school_id_idx').on(table.schoolId),
    sectionIdIdx: index('timetable_slots_section_id_idx').on(table.sectionId),
    subjectIdIdx: index('timetable_slots_subject_id_idx').on(table.subjectId),
    teacherMembershipIdIdx: index(
      'timetable_slots_teacher_membership_id_idx'
    ).on(table.teacherMembershipId),
    timesSane: check(
      'timetable_slots_times_sane',
      sql`${table.endsAt} > ${table.startsAt}`
    ),
  })
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('attendance_records_school_id_idx').on(table.schoolId),
    studentIdDateIdx: index('attendance_records_student_id_date_idx').on(
      table.studentId,
      table.date
    ),
    markedByMembershipIdIdx: index(
      'attendance_records_marked_by_membership_id_idx'
    ).on(table.markedByMembershipId),
  })
);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
  },
  (table) => ({
    schoolIdIdx: index('assessments_school_id_idx').on(table.schoolId),
    sectionIdIdx: index('assessments_section_id_idx').on(table.sectionId),
    subjectIdIdx: index('assessments_subject_id_idx').on(table.subjectId),
    termIdIdx: index('assessments_term_id_idx').on(table.termId),
  })
);

export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('marks_school_id_idx').on(table.schoolId),
    assessmentIdIdx: index('marks_assessment_id_idx').on(table.assessmentId),
    studentIdIdx: index('marks_student_id_idx').on(table.studentId),
    enteredByIdx: index('marks_entered_by_idx').on(table.enteredBy),
  })
);

export const reportCards = pgTable(
  'report_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id),
    status: reportCardStatusEnum('status').notNull().default('draft'),
    // The computed grades/subject-totals snapshot - frozen at compute time
    // so publish never silently recomputes against marks that changed
    // since the draft was reviewed. PDF rendering is a later stage; this
    // is the JSON that a PDF (or the app UI) will eventually be generated
    // from.
    payload: jsonb('payload').notNull().default({}),
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
    schoolIdIdx: index('report_cards_school_id_idx').on(table.schoolId),
    studentIdIdx: index('report_cards_student_id_idx').on(table.studentId),
    termIdIdx: index('report_cards_term_id_idx').on(table.termId),
  })
);

export const announcements = pgTable(
  'announcements',
  {
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
  },
  (table) => ({
    schoolIdPublishedAtIdx: index(
      'announcements_school_id_published_at_idx'
    ).on(table.schoolId, table.publishedAt),
    authorMembershipIdIdx: index('announcements_author_membership_id_idx').on(
      table.authorMembershipId
    ),
  })
);

export const announcementReads = pgTable(
  'announcement_reads',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
    schoolIdIdx: index('announcement_reads_school_id_idx').on(table.schoolId),
    announcementIdIdx: index('announcement_reads_announcement_id_idx').on(
      table.announcementId
    ),
    userIdIdx: index('announcement_reads_user_id_idx').on(table.userId),
  })
);

export const homework = pgTable(
  'homework',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
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
  },
  (table) => ({
    schoolIdIdx: index('homework_school_id_idx').on(table.schoolId),
    sectionIdIdx: index('homework_section_id_idx').on(table.sectionId),
    subjectIdIdx: index('homework_subject_id_idx').on(table.subjectId),
    teacherMembershipIdIdx: index('homework_teacher_membership_id_idx').on(
      table.teacherMembershipId
    ),
  })
);

export const notifications = pgTable(
  'notifications',
  {
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
  },
  (table) => ({
    schoolIdIdx: index('notifications_school_id_idx').on(table.schoolId),
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
  })
);

export const auditLogs = pgTable(
  'audit_logs',
  {
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
  },
  (table) => ({
    schoolIdIdx: index('audit_logs_school_id_idx').on(table.schoolId),
    actorUserIdIdx: index('audit_logs_actor_user_id_idx').on(
      table.actorUserId
    ),
  })
);
