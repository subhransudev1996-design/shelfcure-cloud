'use client';

import { useEffect } from 'react';

/**
 * Fires window.print() once on mount.
 * Kept as a tiny client component so the print page can otherwise stay
 * a server component (cheaper, no client-bundle for layout).
 */
export function AutoPrint() {
  useEffect(() => {
    // Small delay so styles + fonts settle before the print dialog opens.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
