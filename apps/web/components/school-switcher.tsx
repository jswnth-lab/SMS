'use client';

import { useSchool } from '../lib/school-context';

export function SchoolSwitcher() {
  const { memberships, currentSchoolId, setCurrentSchoolId } = useSchool();

  if (memberships.length <= 1) {
    return <span>{memberships[0]?.schoolName}</span>;
  }

  return (
    <select value={currentSchoolId ?? ''} onChange={(e) => setCurrentSchoolId(e.target.value)}>
      {memberships.map((m) => (
        <option key={m.schoolId} value={m.schoolId}>
          {m.schoolName} ({m.role})
        </option>
      ))}
    </select>
  );
}
