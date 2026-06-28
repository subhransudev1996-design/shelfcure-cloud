import Link from 'next/link';
import { listMasterMedicinesConsole } from '@shelfcure/api-client';
import { getSupabaseServerClient } from '../../../lib/supabase/server';
import { PageHeader } from '../../../components/ui/page-header';
import { EmptyState } from '../../../components/ui/empty-state';
import { LinkButton } from '../../../components/ui/link-button';
import { DeleteMedicineButton } from './delete-medicine-button';

const PAGE_SIZE = 50;

export default async function MasterMedicinesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = '', page = '1' } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const supabase = await getSupabaseServerClient();
  const { items, totalCount } = await listMasterMedicinesConsole(supabase, {
    query: q || undefined,
    page: pageNum,
    limit: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Master Medicines"
        description="The shared medicine catalog every store's Add Medicine autocomplete searches. Add a medicine here once and it's instantly suggested — with all fields pre-filled — across every organization."
        actions={
          <>
            <LinkButton href="/console/master-medicines/import" variant="secondary">
              Import CSV
            </LinkButton>
            <LinkButton
              href="/console/master-medicines/new"
              leadingIcon={
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                </svg>
              }
            >
              Add medicine
            </LinkButton>
          </>
        }
      />

      <form className="mb-4 max-w-md" action="/console/master-medicines">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, salt, or manufacturer…"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all placeholder:text-zinc-400 hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
        />
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M10.5 3.5a5 5 0 1 1 7.07 7.07l-5.5 5.5a5 5 0 1 1-7.07-7.07l3-3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title={q ? 'No matches' : 'No medicines in the catalog yet'}
          description={
            q
              ? `Nothing matched "${q}". Try a different search, or add it as a new medicine.`
              : 'Add medicines here to power every store\'s Add Medicine autocomplete.'
          }
          action={<LinkButton href="/console/master-medicines/new">Add medicine</LinkButton>}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Salt / Composition</th>
                  <th className="px-5 py-3">Manufacturer</th>
                  <th className="px-5 py-3">Form</th>
                  <th className="px-5 py-3">Pack</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-zinc-900">{m.name}</div>
                      {m.strength && <div className="text-xs text-zinc-400">{m.strength}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600">{m.salt_composition ?? '—'}</td>
                    <td className="px-5 py-3.5 text-zinc-600">{m.manufacturer ?? '—'}</td>
                    <td className="px-5 py-3.5 text-zinc-600">{m.dosage_form ?? '—'}</td>
                    <td className="px-5 py-3.5 text-zinc-600">
                      {m.pack_size != null ? `${m.pack_size} ${m.pack_unit ?? ''}`.trim() : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-600">{m.category ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <LinkButton href={`/console/master-medicines/${m.id}`} variant="secondary" size="sm">
                          Edit
                        </LinkButton>
                        <DeleteMedicineButton id={m.id} name={m.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
              <span>
                Page {pageNum} of {totalPages} · {totalCount} medicines
              </span>
              <div className="flex gap-2">
                {pageNum > 1 && (
                  <Link
                    href={`/console/master-medicines?${new URLSearchParams({ q, page: String(pageNum - 1) })}`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    ← Previous
                  </Link>
                )}
                {pageNum < totalPages && (
                  <Link
                    href={`/console/master-medicines?${new URLSearchParams({ q, page: String(pageNum + 1) })}`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
