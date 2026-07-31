import type { CsvRow } from './csv';

export interface RowError {
  line: number;
  field?: string;
  message: string;
}

export interface StudentImportRow {
  line: number;
  admissionNo: string;
  nameEn: string;
  nameAr: string | null;
  dob: string;
  gender: 'male' | 'female';
  sectionId: string;
  joinedOn: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Case/punctuation-insensitive column lookup: "Admission No", "admission_no", "admissionNo" all match. */
function pick(fields: Record<string, string>, ...aliases: string[]): string | undefined {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) normalized[normalizeKey(k)] = v;
  for (const alias of aliases) {
    const val = normalized[normalizeKey(alias)];
    if (val !== undefined && val.trim() !== '') return val.trim();
  }
  return undefined;
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export interface ExistingStudentImportContext {
  admissionNos: Set<string>;
  sections: { id: string; name: string }[];
}

export function validateStudentRows(
  rows: CsvRow[],
  existing: ExistingStudentImportContext
): { valid: StudentImportRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const valid: StudentImportRow[] = [];
  const seenAdmissionNos = new Set<string>();

  for (const { lineNumber: line, fields } of rows) {
    const rowErrors: RowError[] = [];

    const admissionNo = pick(fields, 'admissionNo', 'admission_no');
    if (!admissionNo) {
      rowErrors.push({ line, field: 'admissionNo', message: 'admission_no is required' });
    } else if (seenAdmissionNos.has(admissionNo)) {
      rowErrors.push({ line, field: 'admissionNo', message: `duplicate admission_no "${admissionNo}" in file` });
    } else if (existing.admissionNos.has(admissionNo)) {
      rowErrors.push({ line, field: 'admissionNo', message: `admission_no "${admissionNo}" already exists` });
    }
    if (admissionNo) seenAdmissionNos.add(admissionNo);

    const nameEn = pick(fields, 'nameEn', 'name_en', 'name');
    if (!nameEn) rowErrors.push({ line, field: 'nameEn', message: 'name_en is required' });

    const nameArRaw = pick(fields, 'nameAr', 'name_ar');
    let nameAr: string | null = null;
    if (nameArRaw) {
      if (nameArRaw.includes('�')) {
        rowErrors.push({
          line,
          field: 'nameAr',
          message: 'name_ar contains unreadable characters - check the file was saved with the correct encoding',
        });
      } else {
        nameAr = nameArRaw;
      }
    }

    const dob = pick(fields, 'dob', 'dateOfBirth', 'date_of_birth');
    if (!dob || !isValidDate(dob)) {
      rowErrors.push({ line, field: 'dob', message: 'dob is required and must be YYYY-MM-DD' });
    }

    const genderRaw = pick(fields, 'gender');
    const gender = genderRaw?.toLowerCase();
    if (gender !== 'male' && gender !== 'female') {
      rowErrors.push({ line, field: 'gender', message: 'gender must be "male" or "female"' });
    }

    const joinedOn = pick(fields, 'joinedOn', 'joined_on', 'admissionDate');
    if (!joinedOn || !isValidDate(joinedOn)) {
      rowErrors.push({ line, field: 'joinedOn', message: 'joined_on is required and must be YYYY-MM-DD' });
    }

    if (dob && joinedOn && isValidDate(dob) && isValidDate(joinedOn) && new Date(dob) >= new Date(joinedOn)) {
      rowErrors.push({ line, field: 'dob', message: 'dob must be before joined_on' });
    }

    let sectionId = pick(fields, 'sectionId', 'section_id');
    if (sectionId && !UUID_RE.test(sectionId)) sectionId = undefined;
    if (sectionId && !existing.sections.some((s) => s.id === sectionId)) sectionId = undefined;
    if (!sectionId) {
      const sectionName = pick(fields, 'sectionName', 'section_name', 'section');
      if (!sectionName) {
        rowErrors.push({ line, field: 'sectionId', message: 'sectionId or sectionName is required' });
      } else {
        const matches = existing.sections.filter((s) => s.name.toLowerCase() === sectionName.toLowerCase());
        if (matches.length === 0) {
          rowErrors.push({ line, field: 'sectionId', message: `no section named "${sectionName}"` });
        } else if (matches.length > 1) {
          rowErrors.push({
            line,
            field: 'sectionId',
            message: `section name "${sectionName}" is ambiguous - use sectionId instead`,
          });
        } else {
          sectionId = matches[0].id;
        }
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    valid.push({
      line,
      admissionNo: admissionNo!,
      nameEn: nameEn!,
      nameAr,
      dob: dob!,
      gender: gender as 'male' | 'female',
      sectionId: sectionId!,
      joinedOn: joinedOn!,
    });
  }

  return { valid, errors };
}
