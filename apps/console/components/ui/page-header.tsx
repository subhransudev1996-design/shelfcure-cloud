import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-zinc-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
