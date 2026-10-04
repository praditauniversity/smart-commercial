import prisma from '@/lib/prisma';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '@/lib/media-limits';

export { DEFAULT_MAX_VIDEO_DURATION_SECONDS, MAX_VIDEO_DURATION_SECONDS } from '@/lib/media-limits';

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
