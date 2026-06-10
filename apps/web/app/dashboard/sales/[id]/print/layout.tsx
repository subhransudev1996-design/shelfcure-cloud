import type { ReactNode } from 'react';

/**
 * Print routes bypass the dashboard chrome so the receipt is the only thing
 * the printer (or PDF target) sees. This file overrides the parent
 * /dashboard/layout.tsx for any route under /dashboard/sales/[id]/print.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-zinc-100 print:bg-white">{children}</div>;
}
