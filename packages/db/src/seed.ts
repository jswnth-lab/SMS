import { faker } from '@faker-js/faker';
import { sql } from 'drizzle-orm';
import { client, db } from './client';
import {
  academicYears,
  announcements,
  assessments,
  attendanceRecords,
  gradeLevels,
  guardians,
  homework,
  marks,
  schoolMemberships,
  schools,
  sections,
  students,
  studentGuardians,
  subjects,
  teachingAssignments,
  terms,
  timetableSlots,
  users,
} from './schema';

// A small list of real Arabic names, paired by gender, used for name_ar
// alongside faker-generated English names (nameEn/nameAr are independent
// identities in this schema, not translations of each other).
const ARABIC_MALE_FIRST = [
  'Ahmed', 'Mohammed', 'Ali', 'Omar', 'Youssef',
  'Khalid', 'Hassan', 'Ibrahim', 'Karim', 'Tariq',
];
const ARABIC_FEMALE_FIRST = [
  'Fatima', 'Aisha', 'Mariam', 'Layla', 'Noor',
  'Salma', 'Huda', 'Rania', 'Yasmin', 'Zainab',
];
const ARABIC_LAST = [
  'Al-Farsi', 'Al-Sayed', 'Hassan', 'Abdullah', 'Al-Amin',
  'Nasser', 'Al-Mansour', 'Saleh', 'Karimi', 'Al-Hashimi',
];

function arabicName(gender: 'male' | 'female'): string {
  const first = pick(gender === 'male' ? ARABIC_MALE_FIRST : ARABIC_FEMALE_FIRST);
  return `${first} ${pick(ARABIC_LAST)}`;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

const TABLES_IN_TRUNCATE_ORDER = [
  'audit_logs',
  'notifications',
  'homework',
  'announcement_reads',
  'announcements',
  'report_cards',
  'marks',
  'assessments',
  'attendance_records',
  'timetable_slots',
  'teaching_assignments',
  'student_guardians',
  'guardians',
  'students',
  'subjects',
  'sections',
  'grade_levels',
  'terms',
  'academic_years',
  'school_memberships',
  'users',
  'schools',
];

async function truncateAll() {
  const identifiers = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE;`));
}

async function seed() {
  console.log('🌱 Truncating existing data...');
  await truncateAll();

  console.log('🏫 Creating school...');
  const [school] = await db
    .insert(schools)
    .values({
      name: 'Demo School',
      slug: 'demo-school',
      localeDefault: 'en',
      status: 'active',
    })
    .returning();

  console.log('👤 Creating admin...');
  const [adminUser] = await db
    .insert(users)
    .values({
      phone: '+10000000000',
      email: 'admin@example.com',
      passwordHash: 'change-me',
      nameEn: 'Demo Admin',
      locale: 'en',
    })
    .returning();

  const [adminMembership] = await db
    .insert(schoolMemberships)
    .values({
      userId: adminUser.id,
      schoolId: school.id,
      role: 'admin',
      status: 'active',
    })
    .returning();

  console.log('🧑‍🏫 Creating 8 teachers...');
  const teacherUserRows = Array.from({ length: 8 }, (_, i) => {
    const gender = i % 2 === 0 ? ('male' as const) : ('female' as const);
    return {
      phone: `+1100000${String(i).padStart(4, '0')}`,
      email: `teacher${i + 1}@example.com`,
      passwordHash: 'change-me',
      nameEn: faker.person.fullName({ sex: gender }),
      nameAr: arabicName(gender),
      locale: 'en',
    };
  });
  const teacherUsers = await db.insert(users).values(teacherUserRows).returning();
  const teacherMemberships = await db
    .insert(schoolMemberships)
    .values(
      teacherUsers.map((u) => ({
        userId: u.id,
        schoolId: school.id,
        role: 'teacher' as const,
        status: 'active' as const,
      }))
    )
    .returning();

  console.log('📅 Creating academic year + 2 terms...');
  const [year] = await db
    .insert(academicYears)
    .values({
      schoolId: school.id,
      name: '2025-2026',
      startsOn: '2025-09-01',
      endsOn: '2026-06-30',
      isCurrent: true,
    })
    .returning();

  const [term1, term2] = await db
    .insert(terms)
    .values([
      {
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Term 1',
        startsOn: '2025-09-01',
        endsOn: '2026-01-31',
      },
      {
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Term 2',
        startsOn: '2026-02-01',
        endsOn: '2026-06-30',
      },
    ])
    .returning();

  console.log('🏷️  Creating 2 grade levels × 2 sections...');
  const gradeLevelRows = await db
    .insert(gradeLevels)
    .values([
      { schoolId: school.id, name: 'Grade 5', sort: 1 },
      { schoolId: school.id, name: 'Grade 6', sort: 2 },
    ])
    .returning();

  const sectionSpecs: { gradeLevelIdx: number; name: string; homeroomIdx: number }[] = [
    { gradeLevelIdx: 0, name: 'A', homeroomIdx: 0 },
    { gradeLevelIdx: 0, name: 'B', homeroomIdx: 1 },
    { gradeLevelIdx: 1, name: 'A', homeroomIdx: 2 },
    { gradeLevelIdx: 1, name: 'B', homeroomIdx: 3 },
  ];
  const sectionRows = await db
    .insert(sections)
    .values(
      sectionSpecs.map((s) => ({
        schoolId: school.id,
        gradeLevelId: gradeLevelRows[s.gradeLevelIdx].id,
        academicYearId: year.id,
        name: s.name,
        homeroomTeacherMembershipId: teacherMemberships[s.homeroomIdx].id,
      }))
    )
    .returning();

  console.log('📚 Creating 6 subjects...');
  const subjectRows = await db
    .insert(subjects)
    .values([
      { schoolId: school.id, nameEn: 'Mathematics', nameAr: 'الرياضيات', code: 'MATH' },
      { schoolId: school.id, nameEn: 'Science', nameAr: 'العلوم', code: 'SCI' },
      { schoolId: school.id, nameEn: 'English', nameAr: 'الإنجليزية', code: 'ENG' },
      { schoolId: school.id, nameEn: 'Arabic', nameAr: 'العربية', code: 'ARB' },
      { schoolId: school.id, nameEn: 'Social Studies', nameAr: 'الدراسات الاجتماعية', code: 'SST' },
      { schoolId: school.id, nameEn: 'Art', nameAr: 'الفنون', code: 'ART' },
    ])
    .returning();

  console.log('🎓 Creating 60 students (15 per section)...');
  const studentRows = await db
    .insert(students)
    .values(
      Array.from({ length: 60 }, (_, i) => {
        const gender = i % 2 === 0 ? ('male' as const) : ('female' as const);
        const section = sectionRows[Math.floor(i / 15)];
        const dob = faker.date.birthdate({ min: 10, max: 12, mode: 'age' });
        const joinedOn = faker.date.past({ years: 2 });
        return {
          schoolId: school.id,
          admissionNo: `ADM${String(i + 1).padStart(4, '0')}`,
          nameEn: faker.person.fullName({ sex: gender }),
          nameAr: arabicName(gender),
          dob: toDateString(dob),
          gender,
          sectionId: section.id,
          status: 'active' as const,
          joinedOn: toDateString(joinedOn),
          meta: {},
        };
      })
    )
    .returning();

  console.log('👨‍👩‍👧 Creating 80 guardians (some sharing children)...');
  // 10 sibling families (2 children each, sharing 2 guardians) -> 20 students / 20 guardians
  // 20 students with their own 2 unique guardians                -> 20 students / 40 guardians
  // 20 students with a single guardian                            -> 20 students / 20 guardians
  // total: 60 students, 80 guardians
  let guardianUserSeq = 0;
  function nextGuardianUser(role: 'father' | 'mother' | 'guardian') {
    guardianUserSeq += 1;
    const gender = role === 'mother' ? ('female' as const) : ('male' as const);
    return {
      phone: `+1200000${String(guardianUserSeq).padStart(4, '0')}`,
      email: `guardian${guardianUserSeq}@example.com`,
      passwordHash: 'change-me',
      nameEn: faker.person.fullName({ sex: gender }),
      nameAr: arabicName(gender),
      locale: 'en',
    };
  }

  const guardianUserValues: ReturnType<typeof nextGuardianUser>[] = [];
  type GuardianLink = {
    userIdx: number;
    relation: 'father' | 'mother' | 'guardian';
    isPrimary: boolean;
    studentIdxs: number[];
  };
  const guardianLinks: GuardianLink[] = [];

  let studentCursor = 0;

  // 10 sibling families
  for (let f = 0; f < 10; f++) {
    const child1 = studentCursor++;
    const child2 = studentCursor++;
    const fatherIdx = guardianUserValues.push(nextGuardianUser('father')) - 1;
    const motherIdx = guardianUserValues.push(nextGuardianUser('mother')) - 1;
    guardianLinks.push({ userIdx: fatherIdx, relation: 'father', isPrimary: true, studentIdxs: [child1, child2] });
    guardianLinks.push({ userIdx: motherIdx, relation: 'mother', isPrimary: false, studentIdxs: [child1, child2] });
  }

  // 20 students with 2 unique guardians each
  for (let s = 0; s < 20; s++) {
    const child = studentCursor++;
    const fatherIdx = guardianUserValues.push(nextGuardianUser('father')) - 1;
    const motherIdx = guardianUserValues.push(nextGuardianUser('mother')) - 1;
    guardianLinks.push({ userIdx: fatherIdx, relation: 'father', isPrimary: true, studentIdxs: [child] });
    guardianLinks.push({ userIdx: motherIdx, relation: 'mother', isPrimary: false, studentIdxs: [child] });
  }

  // 20 students with a single guardian
  for (let s = 0; s < 20; s++) {
    const child = studentCursor++;
    const guardianIdx = guardianUserValues.push(nextGuardianUser('guardian')) - 1;
    guardianLinks.push({ userIdx: guardianIdx, relation: 'guardian', isPrimary: true, studentIdxs: [child] });
  }

  const guardianUsers = await db.insert(users).values(guardianUserValues).returning();
  const guardianRows = await db
    .insert(guardians)
    .values(guardianUsers.map((u) => ({ schoolId: school.id, userId: u.id })))
    .returning();

  const studentGuardianValues = guardianLinks.flatMap((link) =>
    link.studentIdxs.map((studentIdx) => ({
      schoolId: school.id,
      studentId: studentRows[studentIdx].id,
      guardianId: guardianRows[link.userIdx].id,
      relation: link.relation,
      isPrimary: link.isPrimary,
      verifiedAt: Math.random() < 0.9 ? new Date() : null,
    }))
  );
  await db.insert(studentGuardians).values(studentGuardianValues);

  console.log('🧑‍🏫 Creating teaching assignments (4 sections × 6 subjects)...');
  const assignmentValues = sectionRows.flatMap((section, sIdx) =>
    subjectRows.map((subject, subIdx) => ({
      schoolId: school.id,
      teacherMembershipId: teacherMemberships[(sIdx * subjectRows.length + subIdx) % teacherMemberships.length].id,
      sectionId: section.id,
      subjectId: subject.id,
      academicYearId: year.id,
    }))
  );
  const assignmentRows = await db.insert(teachingAssignments).values(assignmentValues).returning();

  const teacherForSectionSubject = new Map<string, string>();
  for (const a of assignmentRows) {
    teacherForSectionSubject.set(`${a.sectionId}:${a.subjectId}`, a.teacherMembershipId);
  }

  console.log('🗓️  Creating full weekly timetable...');
  const PERIOD_TIMES: [string, string][] = [
    ['08:00:00', '08:45:00'],
    ['08:45:00', '09:30:00'],
    ['09:45:00', '10:30:00'],
    ['10:30:00', '11:15:00'],
    ['11:30:00', '12:15:00'],
    ['12:15:00', '13:00:00'],
  ];
  const timetableValues = sectionRows.flatMap((section) =>
    Array.from({ length: 5 }, (_, dayIdx) => dayIdx + 1).flatMap((dayOfWeek) =>
      subjectRows.map((subject, periodIdx) => {
        const [startsAt, endsAt] = PERIOD_TIMES[periodIdx];
        return {
          schoolId: school.id,
          sectionId: section.id,
          dayOfWeek,
          periodNo: periodIdx + 1,
          subjectId: subject.id,
          teacherMembershipId: teacherForSectionSubject.get(`${section.id}:${subject.id}`)!,
          room: `Room ${section.name}${periodIdx + 1}`,
          startsAt,
          endsAt,
        };
      })
    )
  );
  await db.insert(timetableSlots).values(timetableValues);

  console.log('📋 Creating 2 weeks of attendance...');
  const homeroomForSection = new Map(sectionRows.map((s) => [s.id, s.homeroomTeacherMembershipId!]));
  const attendanceDates: string[] = [];
  const week1Start = new Date('2026-03-02'); // a Monday within term 2
  for (const weekOffset of [0, 7]) {
    for (let d = 0; d < 5; d++) {
      attendanceDates.push(toDateString(addDays(week1Start, weekOffset + d)));
    }
  }
  const attendanceValues = studentRows.flatMap((student) =>
    attendanceDates.map((date) => ({
      schoolId: school.id,
      studentId: student.id,
      date,
      periodNo: null,
      status: pickWeighted<'present' | 'absent' | 'late' | 'excused'>([
        ['present', 85],
        ['absent', 8],
        ['late', 5],
        ['excused', 2],
      ]),
      markedByMembershipId: homeroomForSection.get(student.sectionId)!,
      note: null,
    }))
  );
  await db.insert(attendanceRecords).values(attendanceValues);

  console.log('📝 Creating 2 assessments/subject with marks...');
  const assessmentValues = sectionRows.flatMap((section) =>
    subjectRows.flatMap((subject) => [
      {
        schoolId: school.id,
        sectionId: section.id,
        subjectId: subject.id,
        termId: term1.id,
        name: `${subject.nameEn} Midterm`,
        type: 'midterm',
        maxMarks: '100',
        weight: '1',
        date: '2025-11-15',
      },
      {
        schoolId: school.id,
        sectionId: section.id,
        subjectId: subject.id,
        termId: term2.id,
        name: `${subject.nameEn} Final`,
        type: 'final',
        maxMarks: '100',
        weight: '1',
        date: '2026-04-20',
      },
    ])
  );
  const assessmentRows = await db.insert(assessments).values(assessmentValues).returning();

  const studentsBySection = new Map<string, typeof studentRows>();
  for (const student of studentRows) {
    const list = studentsBySection.get(student.sectionId) ?? [];
    list.push(student);
    studentsBySection.set(student.sectionId, list);
  }

  const markValues = assessmentRows.flatMap((assessment) => {
    const sectionStudents = studentsBySection.get(assessment.sectionId) ?? [];
    const enteredBy = teacherForSectionSubject.get(`${assessment.sectionId}:${assessment.subjectId}`)!;
    return sectionStudents.map((student) => ({
      schoolId: school.id,
      assessmentId: assessment.id,
      studentId: student.id,
      score: String(faker.number.int({ min: 40, max: 100 })),
      remark: null,
      enteredBy,
    }));
  });
  await db.insert(marks).values(markValues);

  console.log('📢 Creating 5 announcements...');
  await db.insert(announcements).values(
    Array.from({ length: 5 }, (_, i) => ({
      schoolId: school.id,
      authorMembershipId: adminMembership.id,
      title: faker.lorem.sentence({ min: 4, max: 8 }),
      body: faker.lorem.paragraph(),
      audience: { roles: ['all'] },
      publishedAt: addDays(new Date('2026-03-01'), i * 3),
    }))
  );

  console.log('📓 Creating 3 homework items...');
  const homeworkPicks = [sectionRows[0], sectionRows[1], sectionRows[2]].map((section, i) => {
    const subject = subjectRows[i];
    return {
      schoolId: school.id,
      sectionId: section.id,
      subjectId: subject.id,
      teacherMembershipId: teacherForSectionSubject.get(`${section.id}:${subject.id}`)!,
      title: `${subject.nameEn} Homework ${i + 1}`,
      body: faker.lorem.paragraph(),
      dueOn: toDateString(addDays(new Date('2026-03-10'), i * 2)),
      attachments: [],
    };
  });
  await db.insert(homework).values(homeworkPicks);

  console.log('✅ Seeding completed successfully');
  console.log(`   school=1 users=${1 + teacherUsers.length + guardianUsers.length} students=60 guardians=80`);
}

seed()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
