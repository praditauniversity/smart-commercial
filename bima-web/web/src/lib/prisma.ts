import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Execute a database operation with automatic retry on transient connection drops (P1017, P1001, etc.)
 */
export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 150): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isTransientError =
        err?.code === 'P1017' || // Server has closed the connection
        err?.code === 'P1001' || // Can't reach database server
        err?.message?.includes('bytes remaining on stream') ||
        err?.message?.includes('Connection') ||
        err?.message?.includes('closed') ||
        err?.message?.includes('ECONNRESET');

      if (isTransientError && attempt <= maxRetries) {
        console.warn(`[Prisma Retry] Transient DB error caught (${err.code || err.message}). Retrying attempt ${attempt}/${maxRetries} after ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
}

export default prisma;
