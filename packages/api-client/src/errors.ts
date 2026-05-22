/**
 * Domain-friendly error codes raised by RPCs.
 * Map server SQLSTATE / message to one of these for predictable UI handling.
 */
export type DomainErrorCode =
  | 'not_authenticated'
  | 'profile_already_exists'
  | 'auth_user_missing_email'
  | 'permission_denied'
  | 'not_found'
  | 'validation_failed'
  | 'unknown';

export class DomainError extends Error {
  public override readonly cause?: unknown;

  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
    this.cause = cause;
  }
}

/** Best-effort mapping from Supabase/Postgres errors to DomainErrorCode. */
export function mapSupabaseError(err: unknown): DomainError {
  if (!err || typeof err !== 'object') {
    return new DomainError('unknown', 'Unknown error', err);
  }

  const e = err as { code?: string; message?: string };
  const msg = e.message ?? 'Unknown error';

  if (msg.includes('not_authenticated')) return new DomainError('not_authenticated', msg, err);
  if (msg.includes('profile_already_exists'))
    return new DomainError('profile_already_exists', msg, err);
  if (msg.includes('auth_user_missing_email'))
    return new DomainError('auth_user_missing_email', msg, err);
  if (e.code === '42501') return new DomainError('permission_denied', msg, err);
  if (e.code === '23505') return new DomainError('profile_already_exists', msg, err);

  return new DomainError('unknown', msg, err);
}
