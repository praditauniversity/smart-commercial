import prisma from '@/lib/prisma';

export const DEFAULT_MAX_VIDEO_DURATION_SECONDS = 120;
export const MAX_VIDEO_DURATION_SECONDS = 1200;

export async function getMaxVideoDurationSeconds(): Promise<number> {
  const settings = await prisma.mediaSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      maxVideoDurationSeconds: DEFAULT_MAX_VIDEO_DURATION_SECONDS,
    },
    select: { maxVideoDurationSeconds: true },
  });

  return settings.maxVideoDurationSeconds;
}
