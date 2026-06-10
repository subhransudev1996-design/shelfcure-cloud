import { redirect } from 'next/navigation';

// Inventory unification (WEB_PARITY_PLAN §2.5.1): /medicines and /stock fold
// into /inventory. Kept as a redirect for one release, then removable.
export default function MedicinesPage() {
  redirect('/dashboard/inventory');
}
