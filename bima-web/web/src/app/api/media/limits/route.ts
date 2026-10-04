import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  DEFAULT_MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/lib/video-settings';

async function getSettings() {
  return prisma.mediaSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      maxVideoDurationSeconds: DEFAULT_MAX_VIDEO_DURATION_SECONDS,
    },
  });
}

export async function GET() {
  try {
    await requireAuth();
    const settings = await getSettings();
    return NextResponse.json({ maxVideoDurationSeconds: settings.maxVideoDurationSeconds });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Read media limits error:', error);
    return NextResponse.json({ error: 'Gagal mengambil batas media.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAuth(['admin']);
    const body = await request.json();
    const maxVideoDurationSeconds = body?.maxVideoDurationSeconds;

    if (
      !Number.isInteger(maxVideoDurationSeconds) ||
      maxVideoDurationSeconds < 1 ||
      maxVideoDurationSeconds > MAX_VIDEO_DURATION_SECONDS
    ) {
      return NextResponse.json(
        { error: `Batas harus bilangan bulat antara 1 dan ${MAX_VIDEO_DURATION_SECONDS} detik.` },
        { status: 400 }
      );
    }

    const previous = await getSettings();
    const settings = await prisma.mediaSettings.update({
      where: { id: 'global' },
      data: { maxVideoDurationSeconds },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_MEDIA_LIMITS',
        entityType: 'MediaSettings',
        entityId: settings.id,
        actorId: admin.userId,
        changes: JSON.stringify({
          previousMaxVideoDurationSeconds: previous.maxVideoDurationSeconds,
          maxVideoDurationSeconds: settings.maxVideoDurationSeconds,
        }),
      },
    });

    return NextResponse.json({ maxVideoDurationSeconds: settings.maxVideoDurationSeconds });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Update media limits error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan batas media.' }, { status: 500 });
  }
}
