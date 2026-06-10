import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { AutoPrint } from './auto-print';

interface PageProps {
  params: Promise<{ id: string }>;
}

function fmtINR(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Print-friendly receipt — minimal layout, no app chrome.
 * Visiting this page auto-triggers the browser's print dialog.
 * Layout is sized for A5; switch to thermal width via CSS @media if needed.
 */
export default async function PrintBillPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('rpc_get_sale_detail', { p_sale_id: id });
  if (error || !data) notFound();

  const detail = data as unknown as {
    sale: {
      bill_number: string;
      bill_date: string;
      customer_name: string;
      customer_phone: string | null;
      store_name: string;
      store_code: string;
      created_by_name: string;
      subtotal: number;
      gst_amount: number;
      cgst_amount: number;
      sgst_amount: number;
      igst_amount: number;
      discount_amount: number;
      round_off: number;
      total_amount: number;
      payment_method: string;
      payment_status: string;
      paid_amount: number;
    };
    items: Array<{
      id: string;
      medicine_name: string;
      batch_number: string | null;
      expiry_date: string | null;
      quantity: number;
      mrp: number;
      gst_percentage: number;
      amount: number;
    }>;
  };

  const { sale, items } = detail;

  return (
    <>
      <AutoPrint />
      <div className="mx-auto max-w-[148mm] bg-white p-6 text-zinc-900 print:p-3">
        {/* Header */}
        <div className="text-center">
          <div className="text-lg font-semibold tracking-tight">{sale.store_name}</div>
          <div className="text-xs text-zinc-600">Store code: {sale.store_code}</div>
        </div>

        <div className="my-3 border-t border-dashed border-zinc-400" />

        <div className="flex justify-between text-xs">
          <div>
            <div>
              Bill: <span className="font-mono font-medium">{sale.bill_number}</span>
            </div>
            <div>Date: {fmtDate(sale.bill_date)}</div>
            <div>Cashier: {sale.created_by_name || '—'}</div>
          </div>
          <div className="text-right">
            <div className="font-medium">{sale.customer_name}</div>
            {sale.customer_phone && <div>{sale.customer_phone}</div>}
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-zinc-400" />

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-1">Item</th>
              <th className="w-10 py-1 text-center">Qty</th>
              <th className="w-16 py-1 text-right">MRP</th>
              <th className="w-16 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-zinc-100 align-top">
                <td className="py-1.5">
                  <div className="font-medium">{it.medicine_name}</div>
                  {(it.batch_number || it.expiry_date) && (
                    <div className="text-[10px] text-zinc-500">
                      {it.batch_number && `B: ${it.batch_number}`}
                      {it.batch_number && it.expiry_date && ' · '}
                      {it.expiry_date && `Exp ${it.expiry_date.slice(0, 7)}`}
                      {' · GST '}{it.gst_percentage}%
                    </div>
                  )}
                </td>
                <td className="py-1.5 text-center">{it.quantity}</td>
                <td className="py-1.5 text-right font-mono">{fmtINR(it.mrp)}</td>
                <td className="py-1.5 text-right font-mono">{fmtINR(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-56 space-y-0.5 text-xs">
          <Row label="Subtotal" value={sale.subtotal} />
          {sale.cgst_amount > 0 && <Row label="CGST" value={sale.cgst_amount} />}
          {sale.sgst_amount > 0 && <Row label="SGST" value={sale.sgst_amount} />}
          {sale.igst_amount > 0 && <Row label="IGST" value={sale.igst_amount} />}
          {sale.discount_amount > 0 && <Row label="Discount" value={-sale.discount_amount} />}
          {sale.round_off !== 0 && <Row label="Round off" value={sale.round_off} />}
          <div className="mt-1 flex items-baseline justify-between border-t border-zinc-400 pt-1">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-base font-semibold">{fmtINR(sale.total_amount)}</span>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-zinc-600">
          Payment: <span className="font-medium uppercase">{sale.payment_method}</span>
          {' · '}Paid {fmtINR(sale.paid_amount)} ({sale.payment_status})
        </div>

        <div className="my-3 border-t border-dashed border-zinc-400" />
        <div className="text-center text-[11px] text-zinc-500">
          Thank you for your visit. Get well soon!
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A5; margin: 8mm; }
          body { background: white; }
        }
      `}</style>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span>{label}</span>
      <span className="font-mono">{fmtINR(value)}</span>
    </div>
  );
}
