import type { ReactNode } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 focus:ring-zinc-900/20 shadow-sm hover:shadow-md',
  secondary:
    'bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 focus:ring-zinc-900/15 shadow-sm',
  ghost: 'bg-transparent text-zinc-700 hover:bg-zinc-100 focus:ring-zinc-900/10',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600/30 shadow-sm',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-11 px-5 text-base gap-2 rounded-xl',
};

/** Same visual API as Button, for actions that navigate instead of opening a modal. */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  leadingIcon,
  children,
  className = '',
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-4 active:scale-[0.99] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {leadingIcon}
      <span>{children}</span>
    </Link>
  );
}
