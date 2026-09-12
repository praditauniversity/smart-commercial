import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { sessionId, captureDataUrl, captureType, durationSeconds } = await request.json();

    if (!sessionId || !captureDataUrl) {
      return NextResponse.json(
        { error: 'Session ID dan captureDataUrl wajib disertakan.' },
        { status: 400 }
      );
    }

    const session = await prisma.surveySession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    if (!['berlangsung', 'perlu_perbaikan'].includes(session.status)) {
      return NextResponse.json(
        { error: `Tidak dapat menyimpan capture pada status sesi "${session.status}".` },
        { status: 400 }
      );
    }

    const isVideo = captureType === 'video';
    const timestamp = Date.now();
    const fileName = isVideo ? `live_capture_${timestamp}.mp4` : `live_capture_${timestamp}.jpg`;
    const idempotencyKey = crypto.randomUUID();

    // Create MediaAsset record
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        sessionId: session.id,
        fileName,
        fileType: isVideo ? 'video' : 'image',
        fileUrl: captureDataUrl,
        storagePath: `sessions/${sessionId}/${fileName}`,
        durationSeconds: durationSeconds ? parseFloat(durationSeconds) : null,
        status: 'uploaded',
        idempotencyKey,
      },
    });

    // Proactively trigger processing in background or return
    const url = new URL(request.url);
    const processUrl = `${url.origin}/api/media/${mediaAsset.id}/process`;
    const cookieHeader = request.headers.get('cookie') || '';

    // Trigger async processing
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
    }).catch((err) => console.error('Error triggering async processing:', err));

    return NextResponse.json({
      success: true,
      mediaAsset,
      message: 'Capture berhasil disimpan sebagai MediaAsset dan masuk antrean AI.',
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Save capture error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan live capture.' }, { status: 500 });
  }
}
