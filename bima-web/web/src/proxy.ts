import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJwtToken } from '@/lib/security';
import { canEnterSection, homePathForRole, normalizeRole } from '@/lib/access';

/**
 * Page guard (Next.js 16 "proxy", formerly middleware). It only checks that the session cookie holds a
 * valid, unexpired JWT and that the role may enter the section. API routes stay protected by
 * `requireAuth()`, which additionally re-checks the user in the database (isActive).
 */

// The redirect target must be an absolute URL. Build it from the forwarded headers so it stays correct
// behind a reverse proxy (Tailscale Serve terminates HTTPS and forwards to plain HTTP on :3000).
function redirectTo(request: NextRequest, path: string, clearSession = false) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(':', '');
  const res = NextResponse.redirect(new URL(path, `${proto}://${host}`));
  if (clearSession) res.cookies.delete('bima_session');
  return res;
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get('bima_session')?.value;
  const user = token ? verifyJwtToken(token) : null;

  if (!user) {
    return redirectTo(request, '/login', Boolean(token));
  }

  const role = normalizeRole(user.role);
  if (!canEnterSection(role, request.nextUrl.pathname)) {
    return redirectTo(request, homePathForRole(role));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/surveyor/:path*', '/supervisor/:path*'],
};
