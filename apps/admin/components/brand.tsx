import Link from 'next/link';
import Image from 'next/image';

interface BrandProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  /** Show "Admin" badge next to the wordmark. */
  showAdminBadge?: boolean;
}

export function Brand({
  href = '/',
  size = 'md',
  variant = 'dark',
  showAdminBadge = true,
}: BrandProps) {
  // Source logo is ~762 × 200. Pick heights that preserve aspect ratio.
  const height = { sm: 24, md: 32, lg: 44 }[size];
  const width = Math.round((height * 762) / 200);

  // On dark backgrounds the dark-blue "S" of the logo would disappear, so
  // we set the image inside a soft white pill. On light backgrounds it
  // renders flush.
  const wrapperClass =
    variant === 'light'
      ? 'inline-flex items-center gap-3 rounded-xl bg-white/95 px-3 py-2 shadow-lg shadow-emerald-500/10 ring-1 ring-white/20'
      : 'inline-flex items-center gap-2.5';

  const badgeClass =
    variant === 'light'
      ? 'rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300'
      : 'rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200';

  const content = (
    <span className={wrapperClass}>
      <Image
        src="/logo.png"
        alt="Shelfcure"
        width={width}
        height={height}
        priority
        className="select-none"
        style={{ height, width: 'auto' }}
      />
      {showAdminBadge && <span className={badgeClass}>Admin</span>}
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
