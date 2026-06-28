import Link from 'next/link';
import { PageHeader } from '../../../../components/ui/page-header';
import { BulkImportForm } from './bulk-import-form';

export default function ImportMasterMedicinesPage() {
  return (
    <>
      <div className="mb-4">
        <Link href="/console/master-medicines" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to master medicines
        </Link>
      </div>

      <PageHeader
        eyebrow="Catalog"
        title="Bulk import medicines"
        description="Upload a CSV to add many medicines to the catalog at once. Rows whose name already exists in the catalog are skipped, not overwritten."
      />

      <BulkImportForm />
    </>
  );
}
