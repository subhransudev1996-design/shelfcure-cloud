import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
