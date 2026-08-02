'use client';

import { useSchool } from '../../lib/school-context';

export default function DashboardHome() {
  const { currentMembership } = useSchool();

  return (
    <div>
      <h1>{currentMembership?.schoolName}</h1>
      <p>Signed in as {currentMembership?.role}.</p>
    </div>
  );
}
