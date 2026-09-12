import { cookies } from 'next/headers';
import { verifyJwtToken, UserJwtPayload } from './security';
import prisma from './prisma';

// In-memory short TTL cache to avoid redundant roundtrips to Tokyo on every API request
interface CachedUser {
  user: UserJwtPayload;
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getCurrentUser(): Promise<UserJwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('bima_session')?.value;
  if (!token) return null;

  const payload = verifyJwtToken(token);
  if (!payload) return null;

  const now = Date.now();
  const cached = userCache.get(payload.userId);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  try {
    // Verify user is active in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      userCache.delete(payload.userId);
      return null;
    }

    const userPayload: UserJwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as 'surveyor' | 'admin',
      name: user.name,
    };

    userCache.set(payload.userId, {
      user: userPayload,
      expiresAt: now + USER_CACHE_TTL_MS,
    });

    return userPayload;
  } catch (err) {
    console.warn('DB check failed in getCurrentUser, falling back to verified JWT payload:', err);
    // If DB is temporarily reconnecting, trust the verified cryptographically-signed JWT
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role as 'surveyor' | 'admin',
      name: payload.name,
    };
  }
}

export async function requireAuth(allowedRoles?: ('surveyor' | 'admin')[]) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}
