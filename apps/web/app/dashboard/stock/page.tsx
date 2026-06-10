import { redirect } from 'next/navigation';

// Inventory unification (WEB_PARITY_PLAN §2.5.1): /stock folds into /inventory.
export default function StockPage() {
  redirect('/dashboard/inventory');
}
