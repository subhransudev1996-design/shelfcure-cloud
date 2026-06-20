'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { SignOutButton } from '../app/admin/sign-out-button';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    label: 'Stores',
    href: '/admin/stores',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M4 7h16v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-4 0V7Z M5 10v9h14v-9"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Staff',
    href: '/admin/staff',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Payroll',
    href: '/admin/payroll',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

interface ShellProps {
  user: { fullName: string; email: string; role: string };
  org: { name: string; planTier: string };
  children: ReactNode;
}

export function AdminShell({ user, org, children }: ShellProps) {
  const initials = getInitials(user.fullName);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="border-b border-zinc-100 px-5 py-4">
          <Brand size="sm" />
        </div>

        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Organization
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{org.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{capitalize(org.planTier)} plan · Owner</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarSection label="Main">
            {NAV.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarSection>
        </nav>

        <div className="border-t border-zinc-100 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-900">{user.fullName}</div>
              <div className="truncate text-xs text-zinc-500">{user.email}</div>
            </div>
          </div>
          <div className="mt-2 px-2">
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Mobile top nav */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <Brand size="sm" />
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white">
          {initials}
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-white/95 backdrop-blur-md lg:hidden">
        {NAV.map((item) => (
          <MobileNavLink key={item.href} item={item} />
        ))}
      </nav>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-none px-4 py-8 pb-20 lg:px-8 lg:pb-12">{children}</div>
      </main>
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);

  return (
    <li>
      <Link
        href={item.href}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-emerald-50 font-medium text-emerald-700'
            : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
        }`}
      >
        {item.icon}
        {item.label}
      </Link>
    </li>
  );
}

function MobileNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${
        isActive ? 'text-emerald-700' : 'text-zinc-500'
      }`}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
