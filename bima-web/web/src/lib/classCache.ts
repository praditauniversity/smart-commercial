import prisma from './prisma';

let cachedClasses: any[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getCachedClasses(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedClasses && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedClasses;
  }

  const classes = await prisma.classDefinition.findMany({
    orderBy: { name: 'asc' },
    include: {
      versions: { orderBy: { versionNumber: 'desc' } },
      _count: { select: { detections: true } },
    },
  });

  cachedClasses = classes;
  lastFetchTime = now;
  return classes;
}

export function invalidateClassCache() {
  cachedClasses = null;
  lastFetchTime = 0;
}
