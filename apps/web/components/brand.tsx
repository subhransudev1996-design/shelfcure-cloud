import Link from 'next/link';

interface BrandProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
}

export function Brand({ href = '/', size = 'md', variant = 'dark' }: BrandProps) {
  const sizeClasses = {
    sm: { mark: 'h-7 w-7', text: 'text-base', dot: 'h-1.5 w-1.5' },
    md: { mark: 'h-9 w-9', text: 'text-lg', dot: 'h-2 w-2' },
    lg: { mark: 'h-12 w-12', text: 'text-2xl', dot: 'h-2.5 w-2.5' },
  }[size];

  const textColor = variant === 'light' ? 'text-white' : 'text-zinc-900';
  const subColor = variant === 'light' ? 'text-emerald-200' : 'text-emerald-600';

  const content = (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`${sizeClasses.mark} grid place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-sm ring-1 ring-emerald-800/10`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-3/5 w-3/5 text-white">
          <path
            d="M4 8a4 4 0 0 1 4-4h4v16H8a4 4 0 0 1-4-4V8Z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M20 16a4 4 0 0 1-4 4h-4V4h4a4 4 0 0 1 4 4v8Z"
            fill="currentColor"
            opacity="0.55"
          />
        </svg>
      </span>
      <span className={`flex items-baseline gap-0.5 font-semibold tracking-tight ${textColor}`}>
        <span className={sizeClasses.text}>ShelfCure</span>
        <span className={`${sizeClasses.text} font-normal ${subColor}`}>Cloud</span>
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity hover:opacity-80">
        {content}
      </Link>
    );
  }
  return content;
}
