'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, trailing, className = '', ...inputProps },
  ref,
) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-zinc-800">
        <span>{label}</span>
        {trailing}
      </span>
      <input
        ref={ref}
        {...inputProps}
        className={`w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm transition-all placeholder:text-zinc-400 hover:border-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-zinc-100 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''} ${className}`}
      />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>
      ) : null}
    </label>
  );
});

interface SubmitButtonProps {
  loading?: boolean;
  children: ReactNode;
  type?: 'submit' | 'button';
  onClick?: () => void;
  disabled?: boolean;
}

export function SubmitButton({
  loading,
  children,
  type = 'submit',
  onClick,
  disabled,
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className="group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-[15px] font-medium text-white shadow-sm transition-all hover:bg-zinc-800 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-zinc-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      <span>{children}</span>
    </button>
  );
}

export function Alert({
  variant = 'error',
  children,
}: {
  variant?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    info: 'bg-blue-50 text-blue-800 ring-blue-200',
  }[variant];

  return (
    <div
      className={`animate-fade-in rounded-xl px-3.5 py-2.5 text-sm font-medium ring-1 ${styles}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
