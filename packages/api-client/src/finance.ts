import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@shelfcure/db-types';
import { mapSupabaseError } from './errors';

type Client = SupabaseClient<Database>;

export interface ExpenseCategory {
  id: string;
  name: string;
  is_system: boolean;
}

export interface Expense {
  id: string;
  category_id: string | null;
  category_name: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExpenseSummaryRow {
  category: string;
  total: number;
  cnt: number;
}

export interface AddExpenseInput {
  description: string;
  amount: number;
  expense_date: string;
  category_id?: string | null;
  payment_method?: string;
  notes?: string | null;
}

export interface UpdateExpenseInput extends AddExpenseInput {
  id: string;
}

export const EXPENSE_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'] as const;

export async function listExpenseCategories(
  client: Client,
  storeId: string,
): Promise<ExpenseCategory[]> {
  const { data, error } = await client.rpc('rpc_list_expense_categories', { p_store_id: storeId });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as ExpenseCategory[];
}

export async function addExpenseCategory(
  client: Client,
  storeId: string,
  name: string,
): Promise<string> {
  const { data, error } = await client.rpc('rpc_add_expense_category', {
    p_store_id: storeId,
    p_name: name.trim(),
  });
  if (error) throw mapSupabaseError(error);
  return data as string;
}

export async function deleteExpenseCategory(
  client: Client,
  storeId: string,
  categoryId: string,
): Promise<void> {
  const { error } = await client.rpc('rpc_delete_expense_category', {
    p_store_id: storeId,
    p_category_id: categoryId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function listExpenses(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  const { data, error } = await client.rpc('rpc_list_expenses', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as Expense[];
}

export async function addExpense(
  client: Client,
  storeId: string,
  input: AddExpenseInput,
): Promise<string> {
  const { data, error } = await client.rpc('rpc_add_expense', {
    p_store_id: storeId,
    p_description: input.description,
    p_amount: input.amount,
    p_expense_date: input.expense_date,
    p_category_id: input.category_id ?? null,
    p_payment_method: input.payment_method ?? 'cash',
    p_notes: input.notes ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return data as string;
}

export async function updateExpense(
  client: Client,
  storeId: string,
  input: UpdateExpenseInput,
): Promise<void> {
  const { error } = await client.rpc('rpc_update_expense', {
    p_expense_id: input.id,
    p_store_id: storeId,
    p_description: input.description,
    p_amount: input.amount,
    p_expense_date: input.expense_date,
    p_category_id: input.category_id ?? null,
    p_payment_method: input.payment_method ?? 'cash',
    p_notes: input.notes ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function deleteExpense(
  client: Client,
  storeId: string,
  expenseId: string,
): Promise<void> {
  const { error } = await client.rpc('rpc_delete_expense', {
    p_expense_id: expenseId,
    p_store_id: storeId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function getExpenseSummary(
  client: Client,
  storeId: string,
  from: string,
  to: string,
): Promise<ExpenseSummaryRow[]> {
  const { data, error } = await client.rpc('rpc_expense_summary', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as ExpenseSummaryRow[];
}
