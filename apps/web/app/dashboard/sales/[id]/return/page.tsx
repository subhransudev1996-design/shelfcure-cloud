import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServerClient } from '../../../../../lib/supabase/server';
import { ReturnClient, type OriginalSaleItem } from './return-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SaleReturnPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc('rpc_get_sale_detail', { p_sale_id: id });
  if (error || !data) notFound();

  const detail = data as unknown as {
    sale: {
      id: string;
      store_id: string;
      bill_number: string;
      bill_date: string;
      customer_id: string | null;
      customer_name: string;
      total_amount: number;
      is_fully_returned: boolean;
    };
    items: Array<{
      id: string;
      medicine_id: string | null;
      medicine_name: string;
      batch_id: string | null;
      batch_number: string | null;
      expiry_date: string | null;
      quantity: number;
      mrp: number;
      gst_percentage: number;
      amount: number;
      is_misc_item: boolean;
    }>;
  };

  if (detail.sale.is_fully_returned) {
    // Already fully refunded — bounce to the bill view
    redirect(`/dashboard/sales/${id}`);
  }

  const returnableItems: OriginalSaleItem[] = detail.items
    .filter((i) => !i.is_misc_item && i.medicine_id && i.batch_id && i.quantity > 0)
    .map((i) => ({
      sale_item_id: i.id,
      medicine_id: i.medicine_id!,
      medicine_name: i.medicine_name,
      batch_id: i.batch_id!,
      batch_number: i.batch_number,
      expiry_date: i.expiry_date,
      original_quantity: i.quantity,
      mrp: i.mrp,
      gst_percentage: i.gst_percentage,
      original_amount: i.amount,
    }));

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/dashboard/sales/${id}`} className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Back to bill
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          Return for bill <span className="font-mono text-emerald-700">{detail.sale.bill_number}</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {detail.sale.customer_name} · original total ₹{Number(detail.sale.total_amount).toFixed(2)}
        </p>
      </div>

      <ReturnClient
        saleId={detail.sale.id}
        storeId={detail.sale.store_id}
        customerId={detail.sale.customer_id}
        billNumber={detail.sale.bill_number}
        items={returnableItems}
      />
    </div>
  );
}
