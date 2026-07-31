import type { CsvRow } from './csv';
import type { RowError } from './import-students';

export interface GuardianImportRow {
  line: number;
  nameEn: string;
  phone: string;
  email: string | null;
  relation: 'father' | 'mother' | 'guardian' | 'other';
  studentId: string;
  admissionNo: string;
  isPrimary: boolean;
}

const RELATIONS = new Set(['father', 'mother', 'guardian', 'other']);
const TRUTHY = new Set(['true', 'yes', '1', 'y']);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(fields: Record<string, string>, ...aliases: string[]): string | undefined {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) normalized[normalizeKey(k)] = v;
  for (const alias of aliases) {
    const val = normalized[normalizeKey(alias)];
    if (val !== undefined && val.trim() !== '') return val.trim();
  }
  return undefined;
}

export interface ExistingGuardianImportContext {
  /** admission_no -> students.id, scoped to the school. */
  studentIdByAdmissionNo: Map<string, string>;
  /** phone -> existing guardians.id, for guardians who are already linked to at least one student in this school. */
  existingGuardianIdByPhone: Map<string, string>;
  /** `${studentId}:${guardianId}` pairs that already have a student_guardians row. */
  existingLinks: Set<string>;
}

export function validateGuardianRows(
  rows: CsvRow[],
  existing: ExistingGuardianImportContext
): { valid: GuardianImportRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const valid: GuardianImportRow[] = [];
  const seenInFile = new Set<string>();

  for (const { lineNumber: line, fields } of rows) {
    const rowErrors: RowError[] = [];

    const nameEn = pick(fields, 'guardianNameEn', 'guardianName', 'nameEn', 'name');
    if (!nameEn) rowErrors.push({ line, field: 'nameEn', message: 'guardian name is required' });

    const phone = pick(fields, 'guardianPhone', 'phone');
    if (!phone) rowErrors.push({ line, field: 'phone', message: 'guardian phone is required' });

    const email = pick(fields, 'guardianEmail', 'email') ?? null;

    const relationRaw = pick(fields, 'relation');
    const relation = relationRaw?.toLowerCase();
    if (!relation || !RELATIONS.has(relation)) {
      rowErrors.push({ line, field: 'relation', message: 'relation must be father, mother, guardian, or other' });
    }

    const admissionNo = pick(fields, 'studentAdmissionNo', 'admissionNo', 'admission_no');
    let studentId: string | undefined;
    if (!admissionNo) {
      rowErrors.push({ line, field: 'admissionNo', message: 'student admission_no is required' });
    } else {
      studentId = existing.studentIdByAdmissionNo.get(admissionNo);
      if (!studentId) {
        rowErrors.push({ line, field: 'admissionNo', message: `no student with admission_no "${admissionNo}"` });
      }
    }

    const isPrimaryRaw = pick(fields, 'isPrimary', 'primary');
    const isPrimary = !!isPrimaryRaw && TRUTHY.has(isPrimaryRaw.toLowerCase());

    if (phone && studentId) {
      const dedupeKey = `${phone}:${studentId}:${relation}`;
      if (seenInFile.has(dedupeKey)) {
        rowErrors.push({ line, message: 'duplicate guardian/student/relation row in file' });
      }
      seenInFile.add(dedupeKey);

      const existingGuardianId = existing.existingGuardianIdByPhone.get(phone);
      if (existingGuardianId && existing.existingLinks.has(`${studentId}:${existingGuardianId}`)) {
        rowErrors.push({ line, message: 'this guardian is already linked to this student' });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    valid.push({
      line,
      nameEn: nameEn!,
      phone: phone!,
      email,
      relation: relation as GuardianImportRow['relation'],
      studentId: studentId!,
      admissionNo: admissionNo!,
      isPrimary,
    });
  }

  return { valid, errors };
}
