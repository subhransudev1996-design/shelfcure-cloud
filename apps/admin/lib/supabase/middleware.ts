// Session-refresh helper called from middleware.ts on every request.
// Auth-only (is there a user) — role checks (is the user super_admin) need a DB
// query and happen in app/admin/layout.tsx, not here.
import { type NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@shelfcure/api-client';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerSupabaseClient({
    getAll: () => request.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set(name, value);
        response.cookies.set(name, value, options);
      });
    },
  });

  // IMPORTANT: getUser refreshes the session if needed and rotates the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth');

  // Not authenticated → bounce to login (except on public routes).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated user on /login → send to the admin area.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }

  return response;
}
