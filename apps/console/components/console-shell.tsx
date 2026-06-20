'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { SignOutButton } from '../app/console/sign-out-button';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    label: 'Organizations',
    href: '/console/orgs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Billing Tiers',
    href: '/console/tiers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Platform Admins',
    href: '/console/admins',
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
    label: 'Settings',
    href: '/console/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1v0Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

interface ShellProps {
  admin: { fullName: string; email: string };
  children: ReactNode;
}

export function ConsoleShell({ admin, children }: ShellProps) {
  const initials = getInitials(admin.fullName);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="border-b border-zinc-100 px-5 py-4">
          <Brand size="sm" />
        </div>

        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Platform
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-zinc-900">ShelfCure Console</div>
          <div className="mt-0.5 text-xs text-zinc-500">Internal · ShelfCure staff only</div>
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
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-900">{admin.fullName}</div>
              <div className="truncate text-xs text-zinc-500">{admin.email}</div>
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
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-sm font-semibold text-white">
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
            ? 'bg-indigo-50 font-medium text-indigo-700'
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
        isActive ? 'text-indigo-700' : 'text-zinc-500'
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
