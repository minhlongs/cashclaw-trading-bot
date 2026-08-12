import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPPORTED = ['vi', 'en'];
const DEFAULT = 'vi';

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // Skip static files and API routes
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Check if first segment is a supported locale
  const firstSegment = pathname.split('/')[1];
  if (SUPPORTED.includes(firstSegment)) {
    return NextResponse.next();
  }

  // Redirect to default locale
  const locale = request.cookies.get('locale')?.value || DEFAULT;
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|favicon|.*\\..*).*)'],
};
