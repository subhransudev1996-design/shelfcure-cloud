'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getSaleDetail, quickBillFinder, type SaleDetail, DomainError } from '@shelfcure/api-client';
import { ReturnClient, type OriginalSaleItem } from '../../sales/[id]/return/return-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

function fmtINR(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProcessReturnInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [billQuery, setBillQuery] = useState(searchParams.get('bill') ?? '');
  const [medQuery, setMedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickResults, setQuickResults] = useState<Array<{
    sale_id: string; bill_number: string; bill_date: string;
    customer_name: string; total_amount: number; medicine_snippet: string;
  }>>([]);
  const [quickLoading, setQuickLoading] = useState(false);

  const billInputRef = useRef<HTMLInputElement>(null);

  // Resolve storeId once
  useEffect(() => {
    async function load() {
      const { data: profile } = await supabase.from('user_profiles').select('store_id').single();
      if (profile?.store_id) { setStoreId(profile.store_id); return; }
      const { data: stores } = await supabase.from('stores').select('id').eq('is_active', true).order('code').limit(1);
      setStoreId(stores?.[0]?.id ?? null);
    }
    load();
  }, [supabase]);

  // Auto-submit if ?bill= is set
  useEffect(() => {
    const bill = searchParams.get('bill');
    if (bill) findBill(bill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus bill input
  useEffect(() => { billInputRef.current?.focus(); }, []);

  async function findBill(query?: string) {
    const q = (query ?? billQuery).trim();
    if (!q) return;
    setError(null);
    setLoading(true);
    setDetail(null);
    try {
      // Try looking up by bill number via a sales search — we call getSaleDetail via a
      // bill-number search. We don't have rpc_find_sale_by_bill_number so we
      // search the list then fetch detail.
      const { data: rows, error: listErr } = await supabase.rpc('rpc_list_sales', {
        p_store_id: storeId ?? '',
        p_limit: 5,
        p_offset: 0,
      });
      if (listErr) throw new DomainError('unknown', listErr.message);
      const match = (rows as Array<{ id: string; bill_number: string; is_fully_returned: boolean }>)
        ?.find((r) => r.bill_number.toLowerCase() === q.toLowerCase());
      if (!match) { setError('Bill not found. Check the bill number and try again.'); setLoading(false); return; }
      if (match.is_fully_returned) { setError('This sale is fully returned.'); setLoading(false); return; }
      const d = await getSaleDetail(supabase, match.id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bill');
    } finally {
      setLoading(false);
    }
  }

  async function searchMedicines(q: string) {
    if (!storeId || q.trim().length < 2) { setQuickResults([]); return; }
    setQuickLoading(true);
    try {
      const results = await quickBillFinder(supabase, storeId, q.trim());
      setQuickResults(results);
    } catch {
      setQuickResults([]);
    } finally {
      setQuickLoading(false);
    }
  }

  const returnableItems: OriginalSaleItem[] = useMemo(() => {
    if (!detail) return [];
    return detail.items
      .filter((i) => !i.is_misc_item && i.medicine_id && 'batch_id' in i && i.batch_id && i.quantity > i.returned_quantity)
      .map((i) => ({
        sale_item_id: i.id,
        medicine_id: i.medicine_id!,
        medicine_name: i.medicine_name,
        batch_id: (i as Record<string, unknown>).batch_id as string,
        batch_number: i.batch_number,
        expiry_date: i.expiry_date,
        original_quantity: i.quantity - i.returned_quantity,
        mrp: i.mrp,
        gst_percentage: i.gst_percentage,
        original_amount: i.amount,
      }));
  }, [detail]);

  if (detail && storeId) {
    return (
      <div className="space-y-4">
        <div>
          <button onClick={() => { setDetail(null); setError(null); }}
            className="text-xs text-zinc-500 hover:text-zinc-800">← Find another bill</button>
          <h1 className="mt-1 text-xl font-bold text-zinc-900">
            Return for bill <span className="font-mono text-orange-600">{detail.sale.bill_number}</span>
          </h1>
          <p className="text-sm text-zinc-500">{detail.sale.customer_name} · original total {fmtINR(detail.sale.total_amount)}</p>
        </div>
        <ReturnClient
          saleId={detail.sale.id}
          storeId={storeId}
          customerId={detail.sale.customer_id}
          billNumber={detail.sale.bill_number}
          items={returnableItems}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => router.push('/dashboard/returns')}
          className="text-xs text-zinc-500 hover:text-zinc-800">← All Returns</button>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Process Return</h1>
      </div>

      {/* Find bill card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 font-semibold text-zinc-800">Find Invoice</h2>
        <p className="mb-4 text-sm text-zinc-500">Enter the bill number to load the sale.</p>
        <div className="flex gap-2">
          <input
            ref={billInputRef}
            type="text"
            placeholder="Enter Bill Number (e.g. BL-000047)..."
            value={billQuery}
            onChange={(e) => setBillQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') findBill(); }}
            data-pos-section="bill-search"
            className="h-14 flex-1 rounded-xl border border-zinc-300 px-4 text-lg font-semibold text-zinc-900 placeholder-zinc-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={() => findBill()}
            disabled={loading || !billQuery.trim()}
            className="h-14 rounded-xl bg-indigo-600 px-6 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Find Invoice'}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Quick Bill Finder */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-zinc-700">Don&apos;t have the bill number?</h3>
        <p className="mb-3 text-xs text-zinc-500">Search by medicine name to find recent bills.</p>
        <input
          type="text"
          placeholder="Medicine name…"
          value={medQuery}
          onChange={(e) => { setMedQuery(e.target.value); searchMedicines(e.target.value); }}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        {quickLoading && <p className="mt-2 text-xs text-zinc-400">Searching…</p>}
        {quickResults.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {quickResults.map((r) => (
              <button
                key={r.sale_id}
                onClick={() => { setBillQuery(r.bill_number); findBill(r.bill_number); }}
                className="w-full rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-left hover:bg-indigo-50 hover:border-indigo-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-semibold text-indigo-700">{r.bill_number}</span>
                    <span className="ml-2 text-xs text-zinc-500">{r.customer_name} · {fmtDate(r.bill_date)}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-zinc-700">{fmtINR(r.total_amount)}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-400">Contains: {r.medicine_snippet}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProcessReturnPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-400">Loading…</div>}>
      <ProcessReturnInner />
    </Suspense>
  );
}
