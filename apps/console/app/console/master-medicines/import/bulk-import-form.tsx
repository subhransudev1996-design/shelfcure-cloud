'use client';

import { useRef, useState } from 'react';
import {
  bulkImportMasterMedicinesConsole,
  DomainError,
  type BulkImportResult,
  type MasterMedicineInput,
} from '@shelfcure/api-client';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import { Button } from '../../../../components/ui/button';
import { Alert } from '../../../../components/form-fields';

const TEMPLATE_HEADERS = [
  'Medicine Name',
  'Salt / Composition',
  'Manufacturer',
  'Strength / Concentration',
  'Dosage Form',
  'Pack Unit',
  'Pack Size (qty per pack)',
  'Category',
];

const TEMPLATE_EXAMPLE_ROW = [
  'Paracetamol 500mg',
  'Paracetamol',
  'Cipla',
  '500mg',
  'Tablet',
  'Strip',
  '10',
  'Painkiller',
];

// Accepted header spellings, normalized to lowercase alphanumeric only, mapped
// to MasterMedicineInput keys — lets the same parser tolerate the exact
// TEMPLATE_HEADERS labels and plainer variants (e.g. a hand-edited "Salt").
const HEADER_ALIASES: Record<string, keyof MasterMedicineInput> = {
  medicinename: 'name',
  name: 'name',
  saltcomposition: 'salt_composition',
  salt: 'salt_composition',
  composition: 'salt_composition',
  manufacturer: 'manufacturer',
  strengthconcentration: 'strength',
  strength: 'strength',
  concentration: 'strength',
  dosageform: 'dosage_form',
  form: 'dosage_form',
  packunit: 'pack_unit',
  packsizeqtyperpack: 'pack_size',
  packsize: 'pack_size',
  qtyperpack: 'pack_size',
  category: 'category',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function rowsToItems(rows: string[][]): { items: MasterMedicineInput[]; unmappedHeaders: string[] } {
  if (rows.length === 0) return { items: [], unmappedHeaders: [] };
  const headerRow = rows[0]!;
  const dataRows = rows.slice(1);
  const headerKeys = headerRow.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
  const unmappedHeaders = headerRow.filter((h, i) => headerKeys[i] === null && h.trim() !== '');

  const items: MasterMedicineInput[] = dataRows.map((row) => {
    const item: Record<string, string> = {};
    headerKeys.forEach((key, i) => {
      if (!key) return;
      const value = (row[i] ?? '').trim();
      if (value) item[key] = value;
    });
    const input: MasterMedicineInput = { name: item.name ?? '' };
    if (item.salt_composition) input.salt_composition = item.salt_composition;
    if (item.manufacturer) input.manufacturer = item.manufacturer;
    if (item.strength) input.strength = item.strength;
    if (item.dosage_form) input.dosage_form = item.dosage_form;
    if (item.pack_unit) input.pack_unit = item.pack_unit;
    if (item.category) input.category = item.category;
    if (item.pack_size) {
      const n = Number(item.pack_size);
      if (Number.isFinite(n)) input.pack_size = n;
    }
    return input;
  });

  return { items, unmappedHeaders };
}

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]
    .map((row) => row.map((cell) => (cell.includes(',') ? `"${cell}"` : cell)).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'master-medicines-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<MasterMedicineInput[]>([]);
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const { items: parsed, unmappedHeaders: unmapped } = rowsToItems(parseCsv(text));
    setItems(parsed);
    setUnmappedHeaders(unmapped);
  }

  const validCount = items.filter((i) => i.name.trim() !== '').length;
  const blankNameCount = items.length - validCount;

  async function onImport() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const res = await bulkImportMasterMedicinesConsole(supabase, items.filter((i) => i.name.trim() !== ''));
      setResult(res);
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : 'Import failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFileName(null);
    setItems([]);
    setUnmappedHeaders([]);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">CSV file</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Columns: Medicine Name (required), Salt / Composition, Manufacturer, Strength / Concentration,
              Dosage Form, Pack Unit, Pack Size, Category.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Download template
          </button>
        </div>

        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
        </div>

        {fileName && !result && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-zinc-700">
              <span className="font-medium">{fileName}</span> — {items.length} row{items.length === 1 ? '' : 's'} parsed
              {blankNameCount > 0 && (
                <span className="text-amber-700"> ({blankNameCount} skipped: missing name)</span>
              )}
            </p>
            {unmappedHeaders.length > 0 && (
              <p className="text-amber-700">Unrecognized column(s) ignored: {unmappedHeaders.join(', ')}</p>
            )}
            {validCount > 0 && (
              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Salt</th>
                      <th className="px-3 py-2">Manufacturer</th>
                      <th className="px-3 py-2">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {items.slice(0, 5).map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-zinc-900">{it.name || '—'}</td>
                        <td className="px-3 py-2 text-zinc-600">{it.salt_composition ?? '—'}</td>
                        <td className="px-3 py-2 text-zinc-600">{it.manufacturer ?? '—'}</td>
                        <td className="px-3 py-2 text-zinc-600">{it.category ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length > 5 && (
                  <p className="bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                    + {items.length - 5} more row{items.length - 5 === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {result && (
        <Alert variant={result.errors.length > 0 ? 'info' : 'success'}>
          <div className="space-y-1">
            <p>
              Imported {result.inserted} medicine{result.inserted === 1 ? '' : 's'}.
              {result.skipped.length > 0 && ` Skipped ${result.skipped.length} already in the catalog.`}
            </p>
            {result.skipped.length > 0 && (
              <p className="text-xs opacity-80">Skipped: {result.skipped.join(', ')}</p>
            )}
            {result.errors.length > 0 && <p className="text-xs opacity-80">{result.errors.join('; ')}</p>}
          </div>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        {!result ? (
          <Button onClick={onImport} loading={loading} disabled={validCount === 0}>
            Import {validCount > 0 ? `${validCount} medicine${validCount === 1 ? '' : 's'}` : ''}
          </Button>
        ) : (
          <Button onClick={reset}>Import another file</Button>
        )}
        <Button variant="ghost" type="button" onClick={() => window.history.back()}>
          {result ? 'Done' : 'Cancel'}
        </Button>
      </div>
    </div>
  );
}
