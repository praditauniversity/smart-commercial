import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { compressAndUpload, MediaLimitError, MediaToolError } from '@/lib/media-storage';
import { clipMatchNote, matchEvaluatedClip } from '@/lib/clip-match';

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['surveyor', 'admin']);
    const form = await request.formData();

    const sessionId = form.get('sessionId');
    const file = form.get('file');
    const durationSeconds = form.get('durationSeconds');

    if (typeof sessionId !== 'string' || !sessionId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Session ID dan file wajib disertakan.' },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(fileName);
    if (!isVideo && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Hanya file gambar atau video yang diizinkan.' }, { status: 400 });
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

    // Check if session allows new media
    if (!['berlangsung', 'perlu_perbaikan'].includes(session.status)) {
      return NextResponse.json(
        { error: `Tidak dapat mengupload media pada sesi berstatus "${session.status}".` },
        { status: 400 }
      );
    }

    const idempotencyKey = crypto.randomUUID();
    const mediaId = crypto.randomUUID();

    // Compress as small as possible, then store in the Supabase bucket (img / vids)
    const stored = await compressAndUpload({
      input: Buffer.from(await file.arrayBuffer()),
      kind: isVideo ? 'video' : 'image',
      sessionId,
      mediaId,
    });

    // Pencocokan dengan 35 klip uji RQ3 (hanya video). Cocok = nama berkas DAN durasi sesuai.
    const duration = stored.durationSeconds ?? (durationSeconds ? parseFloat(String(durationSeconds)) : null);
    let match = matchEvaluatedClip('', null, []);
    if (isVideo) {
      const clips = await prisma.evaluatedClip.findMany({ select: { id: true, fileName: true, durationSeconds: true } });
      match = matchEvaluatedClip(fileName, duration, clips);
    }

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        id: mediaId,
        sessionId: session.id,
        fileName,
        fileType: isVideo ? 'video' : 'image',
        fileUrl: stored.fileUrl,
        storagePath: stored.storagePath,
        // Prefer the duration measured by ffprobe over the client-supplied one.
        durationSeconds: duration,
        status: 'uploaded',
        idempotencyKey,
        evaluatedClipId: match.status === 'cocok' ? match.clip.id : null,
        clipMatchNote: clipMatchNote(match),
        processingMetrics: JSON.stringify({
          upload: stored.timings,
        }),
        // Video: frame sampel dari berkas asli. Gambar: berkas itu sendiri adalah satu-satunya frame.
        frames: {
          create: isVideo
            ? stored.frames
            : [{ frameIndex: 0, timestampSeconds: 0, imageUrl: stored.fileUrl }],
        },
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        action: 'SURVEYOR_UPLOAD_MEDIA',
        entityType: 'MediaAsset',
        entityId: mediaAsset.id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: session.id,
          sessionName: session.name,
          fileName: mediaAsset.fileName,
          fileType: mediaAsset.fileType,
          originalBytes: stored.originalBytes,
          storedBytes: stored.storedBytes,
          actionDescription: `Surveyor mengunggah media baru: "${mediaAsset.fileName}" (${mediaAsset.fileType}).`,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      mediaAsset,
      message: 'Media asset berhasil didaftarkan dan disimpan.',
    });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof MediaLimitError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MediaToolError) {
      console.error('Media tool error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error('Media upload registration error:', error);
    return NextResponse.json({ error: 'Gagal mendaftarkan media asset.' }, { status: 500 });
  }
}
