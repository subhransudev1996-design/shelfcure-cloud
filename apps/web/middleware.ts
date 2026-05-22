import { updateSession } from './lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (static assets)
     *   - _next/image (image optimization)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - file extensions (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
