'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { SignOutButton } from '../app/dashboard/sign-out-button';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  badge?: string;
}

const NAV: NavItem[] = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Stores',
    href: '/dashboard/stores',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V9Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Inventory',
    href: '/dashboard/inventory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M8.5 3.5a5 5 0 1 1 7.07 7.07l-5.5 5.5a5 5 0 1 1-7.07-7.07l5.5-5.5Z M12 7l5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Staff',
    href: '/dashboard/staff',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M21 21v-2a4 4 0 0 0-3-3.87 M17 3.13a4 4 0 0 1 0 7.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Doctors',
    href: '/dashboard/doctors',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Customers',
    href: '/dashboard/customers',
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
];

const SALES: NavItem[] = [
  {
    label: 'New sale',
    href: '/dashboard/sales/new',
    badge: 'F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M5 7h14l-1.5 11a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 7Z M9 7V5a3 3 0 1 1 6 0v2"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Sales history',
    href: '/dashboard/sales',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
];

const PURCHASES: NavItem[] = [
  {
    label: 'New purchase',
    href: '/dashboard/purchases/new',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M3 7h13l3 4h2v7h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3V7Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'Purchase history',
    href: '/dashboard/purchases',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Suppliers',
    href: '/dashboard/suppliers',
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
];

const FUTURE: NavItem[] = [];

const INSIGHTS: NavItem[] = [
  {
    label: 'Reports',
    href: '/dashboard/reports',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          stroke="currentColor"
          strokeWidth="1.5"
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

export function DashboardShell({ user, org, children }: ShellProps) {
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
          <div className="mt-0.5 text-xs text-zinc-500">
            {capitalize(org.planTier)} plan · {capitalize(user.role.replace('_', ' '))}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarSection label="Main">
            {NAV.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarSection>
          <SidebarSection label="Sales">
            {SALES.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarSection>
          <SidebarSection label="Purchases">
            {PURCHASES.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarSection>
          <SidebarSection label="Insights">
            {INSIGHTS.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarSection>
          {FUTURE.length > 0 && (
            <SidebarSection label="Coming soon">
              {FUTURE.map((item) => (
                <SidebarLink key={item.label} item={item} disabled />
              ))}
            </SidebarSection>
          )}
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
        <div className="mx-auto max-w-6xl px-4 py-8 pb-20 lg:px-8 lg:pb-12">{children}</div>
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

function SidebarLink({ item, disabled }: { item: NavItem; disabled?: boolean }) {
  const pathname = usePathname();
  const isActive =
    !disabled && (item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href));

  if (disabled) {
    return (
      <li>
        <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-zinc-400">
          {item.icon}
          {item.label}
          <span className="ml-auto rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            soon
          </span>
        </span>
      </li>
    );
  }

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
  const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
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

// Dot placeholder removed — every nav entry now has a real icon and there are
// no "coming soon" rows left to render.

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
