'use client';

import { Select } from './ui';
import { useSchool } from '../lib/school-context';

export function SchoolSwitcher() {
  const { memberships, currentSchoolId, setCurrentSchoolId } = useSchool();

  if (memberships.length <= 1) {
    return <span className="text-sm font-semibold text-slate-900">{memberships[0]?.schoolName}</span>;
  }

  return (
    <Select value={currentSchoolId ?? ''} onChange={(e) => setCurrentSchoolId(e.target.value)} className="w-full">
      {memberships.map((m) => (
        <option key={m.schoolId} value={m.schoolId}>
          {m.schoolName} ({m.role})
        </option>
      ))}
    </Select>
  );
}
