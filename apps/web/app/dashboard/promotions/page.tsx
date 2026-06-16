import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PromotionsHub } from './promotions-hub';

export default async function PromotionsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: store } = await supabase
    .from('stores')
    .select('name')
    .order('created_at')
    .limit(1)
    .single();

  return <PromotionsHub storeName={store?.name ?? 'My Pharmacy'} />;
}
