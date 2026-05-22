import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase/server';

// Handles the redirect from Supabase Auth (email confirmation links, OAuth, etc.)
// Exchanges the code for a session, then routes the user to onboarding or dashboard.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/onboarding';

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
