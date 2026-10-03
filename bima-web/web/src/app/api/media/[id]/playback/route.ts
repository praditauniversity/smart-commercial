import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canViewSessionOf } from '@/lib/access';
import { requireEnvNumber } from '@/lib/env';
import { runPlaybackJob } from '@/lib/playback-runner';
import { parsePlaybackData } from '@/lib/playback-tracks';

function errorResponse(error: any, label: string) {
  if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  console.error(label, error);
  return NextResponse.json({ error: 'Gagal memproses permintaan.' }, { status: 500 });
}

/** Status dan lintasan kotak pemutar untuk satu video. `playback: null` = belum pernah dibuat. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const media = await prisma.mediaAsset.findUnique({ where: { id }, include: { session: { select: { surveyorId: true } }, playback: true } });
    if (!media) return NextResponse.json({ error: 'Media tidak ditemukan.' }, { status: 404 });
    if (!canViewSessionOf(user.role, user.userId, media.session.surveyorId)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (!media.playback) return NextResponse.json({ success: true, playback: null });
    const p = media.playback;
    return NextResponse.json({ success: true, playback: { status: p.status, note: p.note, data: p.status === 'ready' ? parsePlaybackData(p.data) : null } });
  } catch (error: any) {
    return errorResponse(error, 'Get playback error:');
  }
}

/** Membuat (atau membuat ulang) kotak pemutar, mis. untuk video yang diunggah sebelum fitur ini. Berjalan di latar belakang. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const media = await prisma.mediaAsset.findUnique({ where: { id }, include: { session: { select: { surveyorId: true } }, playback: true } });
    if (!media) return NextResponse.json({ error: 'Media tidak ditemukan.' }, { status: 404 });
    if (!canViewSessionOf(user.role, user.userId, media.session.surveyorId)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (media.fileType !== 'video') return NextResponse.json({ error: 'Kotak pemutar hanya untuk video.' }, { status: 400 });
    if (media.status !== 'completed') return NextResponse.json({ error: 'Deteksi media belum selesai.' }, { status: 409 });

    const p = media.playback;
    if (p?.status === 'processing' && Date.now() - p.updatedAt.getTime() < requireEnvNumber('PLAYBACK_MAX_WAIT_MS')) {
      return NextResponse.json({ error: 'Kotak pemutar sedang dibuat.' }, { status: 409 });
    }
    // Status "processing" ditulis sebelum menjawab agar polling klien langsung melihatnya.
    await prisma.mediaPlayback.upsert({
      where: { mediaAssetId: id },
      create: { mediaAssetId: id, status: 'processing' },
      update: { status: 'processing', note: null },
    });
    void runPlaybackJob(id);
    return NextResponse.json({ success: true, status: 'processing' }, { status: 202 });
  } catch (error: any) {
    return errorResponse(error, 'Post playback error:');
  }
}
