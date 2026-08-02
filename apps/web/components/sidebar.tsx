'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Membership } from '../lib/school-context';

interface NavItem {
  href: string;
  label: string;
  roles: Membership['role'][];
}

// Every route the console can show, gated by which roles can see it. A
// route not listed here is implicitly admin-only-by-omission from the
// sidebar (still worth enforcing server-side too - this only hides links,
// it isn't itself an authorization boundary).
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ['admin', 'teacher', 'parent', 'student'] },
  { href: '/students', label: 'Students', roles: ['admin', 'teacher'] },
  { href: '/staff', label: 'Staff & Invites', roles: ['admin'] },
  { href: '/guardians', label: 'Guardians', roles: ['admin'] },
  { href: '/school-setup', label: 'School Setup', roles: ['admin'] },
  { href: '/timetable', label: 'Timetable', roles: ['admin', 'teacher'] },
  { href: '/attendance', label: 'Attendance', roles: ['admin', 'teacher'] },
  { href: '/gradebook', label: 'Gradebook', roles: ['admin', 'teacher'] },
  { href: '/report-cards', label: 'Report Cards', roles: ['admin', 'teacher', 'parent', 'student'] },
  { href: '/announcements', label: 'Announcements', roles: ['admin', 'teacher', 'parent', 'student'] },
  { href: '/homework', label: 'Homework', roles: ['admin', 'teacher', 'parent', 'student'] },
];

export function Sidebar({ role }: { role: Membership['role'] }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 200 }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{ fontWeight: pathname === item.href ? 700 : 400 }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
