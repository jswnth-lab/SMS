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

export const genderEnum = pgEnum('gender', ['male', 'female']);

export const studentStatusEnum = pgEnum('student_status', [
  'active',
  'left',
  'graduated',
]);

export const guardianRelationEnum = pgEnum('guardian_relation', [
  'father',
  'mother',
  'guardian',
  'other',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'excused',
]);

export const reportCardStatusEnum = pgEnum('report_card_status', [
  'draft',
  'published',
]);

export const jobTypeEnum = pgEnum('job_type', [
  'notify.absence',
  'notify.announcement',
  'pdf.report-card',
  'import.students',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
