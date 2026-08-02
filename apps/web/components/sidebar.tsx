'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/cn';
import type { Membership } from '../lib/school-context';

interface NavItem {
  href: string;
  label: string;
  roles: Membership['role'][];
}

// Every route the console can show, gated by which roles can see it. A
// route not listed here is implicitly admin-only-by-omission from the
// sidebar (still worth enforcing server-side too - this only hides links,
// it isn't itself an authorization boundary). Only lists screens that
// actually exist - unbuilt ones (attendance marking, gradebook, homework,
// report cards) stay out until their pages land, so this never 404s.
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ['admin', 'teacher', 'parent', 'student'] },
  { href: '/my-day', label: 'My Day', roles: ['teacher'] },
  { href: '/school-setup', label: 'School Setup', roles: ['admin'] },
  { href: '/students', label: 'Students', roles: ['admin', 'teacher'] },
  { href: '/staff', label: 'Staff & Invites', roles: ['admin'] },
  { href: '/teaching-assignments', label: 'Teaching Assignments', roles: ['admin'] },
  { href: '/timetable', label: 'Timetable', roles: ['admin', 'teacher'] },
  { href: '/gradebook', label: 'Gradebook', roles: ['teacher'] },
  { href: '/homework', label: 'Homework', roles: ['teacher'] },
  { href: '/announcements', label: 'Announcements', roles: ['admin', 'teacher', 'parent', 'student'] },
];

export function Sidebar({ role }: { role: Membership['role'] }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex w-56 flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
