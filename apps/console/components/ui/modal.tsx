'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const maxWidths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: ModalProps) {
  // Esc to close + lock body scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-900/50 px-4 py-8 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`w-full ${maxWidths[maxWidth]} animate-fade-in-up rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200/60`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-zinc-100 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
