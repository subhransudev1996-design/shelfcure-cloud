'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from './brand';
import { SignOutButton } from '../app/dashboard/sign-out-button';

const SIDEBAR_COLLAPSED_KEY = 'shelfcure_sidebar_collapsed';

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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
    label: 'Inventory',
    href: '/dashboard/inventory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path
          d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Staff',
    href: '/dashboard/staff',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Returns',
    href: '/dashboard/returns',
    badge: 'F8',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const PURCHASES: NavItem[] = [
  {
    label: 'New purchase',
    href: '/dashboard/purchases/new',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Pending reorders',
    href: '/dashboard/purchases/orders',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Delivery challans',
    href: '/dashboard/purchases/challans',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Suppliers',
    href: '/dashboard/suppliers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
    label: 'Finance',
    href: '/dashboard/finance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
        <path d="M6 15h4M14 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    href: '/dashboard/reports',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Promotions',
    href: '/dashboard/promotions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
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
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar (desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-zinc-200 bg-white lg:flex ${
          collapsed ? 'w-16' : 'w-64'
        } ${hydrated ? 'transition-all duration-200' : ''}`}
      >
        <div className={`flex items-center border-b border-zinc-100 px-5 py-4 ${collapsed ? 'justify-center px-3' : 'justify-between'}`}>
          {!collapsed && <Brand size="sm" />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <div className="border-b border-zinc-100 px-5 py-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Organization
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{org.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {capitalize(org.planTier)} plan · {capitalize(user.role.replace('_', ' '))}
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarSection label="Main" collapsed={collapsed}>
            {NAV.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </SidebarSection>
          <SidebarSection label="Sales" collapsed={collapsed}>
            {SALES.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </SidebarSection>
          <SidebarSection label="Purchases" collapsed={collapsed}>
            {PURCHASES.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </SidebarSection>
          <SidebarSection label="Insights" collapsed={collapsed}>
            {INSIGHTS.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </SidebarSection>
          {FUTURE.length > 0 && (
            <SidebarSection label="Coming soon" collapsed={collapsed}>
              {FUTURE.map((item) => (
                <SidebarLink key={item.label} item={item} collapsed={collapsed} disabled />
              ))}
            </SidebarSection>
          )}
        </nav>

        <div className="border-t border-zinc-100 px-3 py-3">
          <div className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white shadow-sm"
              title={collapsed ? user.fullName : undefined}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">{user.fullName}</div>
                <div className="truncate text-xs text-zinc-500">{user.email}</div>
              </div>
            )}
          </div>
          <div className={`mt-2 ${collapsed ? 'px-0' : 'px-2'}`}>
            <SignOutButton iconOnly={collapsed} />
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

      <main className={`${collapsed ? 'lg:pl-16' : 'lg:pl-64'} ${hydrated ? 'transition-all duration-200' : ''}`}>
        <div className="mx-auto max-w-none px-4 py-8 pb-20 lg:px-8 lg:pb-12">{children}</div>
      </main>
    </div>
  );
}

function SidebarSection({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      {!collapsed && (
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </div>
      )}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function SidebarLink({
  item,
  collapsed,
  disabled,
}: {
  item: NavItem;
  collapsed?: boolean;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const isActive =
    !disabled && (item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href));

  if (disabled) {
    return (
      <li>
        <span
          title={collapsed ? `${item.label} (soon)` : undefined}
          className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-zinc-400 ${collapsed ? 'justify-center' : ''}`}
        >
          {item.icon}
          {!collapsed && (
            <>
              {item.label}
              <span className="ml-auto rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                soon
              </span>
            </>
          )}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-emerald-50 font-medium text-emerald-700'
            : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
        }`}
      >
        {item.icon}
        {!collapsed && item.label}
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
