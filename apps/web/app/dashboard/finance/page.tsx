import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { resolveActiveStoreId } from '../../../lib/active-store';
import { listExpenseCategories, listExpenses, getExpenseSummary } from '@shelfcure/api-client';
import { FinanceHubClient } from './finance-hub-client';

function monthRange(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

export default async function FinancePage() {
  const supabase = await getSupabaseServerClient();
  const storeId = await resolveActiveStoreId(supabase);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">No store available</h1>
        <p className="mt-2 text-sm text-zinc-600">Select or create a store to use Finance.</p>
      </div>
    );
  }

  const { from, to } = monthRange(0);

  const [categories, expenses, summary] = await Promise.all([
    listExpenseCategories(supabase, storeId).catch(() => []),
    listExpenses(supabase, storeId, from, to).catch(() => []),
    getExpenseSummary(supabase, storeId, from, to).catch(() => []),
  ]);

  return (
    <FinanceHubClient
      storeId={storeId}
      initialCategories={categories}
      initialExpenses={expenses}
      initialSummary={summary}
      initialFrom={from}
      initialTo={to}
    />
  );
}
