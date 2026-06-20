import { SignOutButton } from '../admin/sign-out-button';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">You don&apos;t have access to this area</h1>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500">
        This panel is reserved for organization owners. If you believe this is a mistake, contact your
        organization owner.
      </p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
