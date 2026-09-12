import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { sessionId, fileName, fileType, fileUrl, storagePath, durationSeconds } = body;

    if (!sessionId || !fileName || !fileType) {
      return NextResponse.json(
        { error: 'Session ID, fileName, dan fileType wajib disertakan.' },
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

    // Check if session allows new media
    if (!['berlangsung', 'perlu_perbaikan'].includes(session.status)) {
      return NextResponse.json(
        { error: `Tidak dapat mengupload media pada sesi berstatus "${session.status}".` },
        { status: 400 }
      );
    }

    const idempotencyKey = crypto.randomUUID();
    const mediaId = crypto.randomUUID();

    let finalFileUrl = fileUrl || `/uploads/${fileName}`;
    let finalStoragePath = storagePath || `sessions/${sessionId}/${fileName}`;

    // If fileUrl is a Base64 Data URL, save to server filesystem (public/uploads/)
    if (fileUrl && fileUrl.startsWith('data:')) {
      const uploadsBaseDir = path.join(process.cwd(), 'public', 'uploads', 'sessions', sessionId);
      if (!fs.existsSync(uploadsBaseDir)) {
        fs.mkdirSync(uploadsBaseDir, { recursive: true });
      }

      const safeFileName = `${mediaId}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(uploadsBaseDir, safeFileName);

      const base64Data = fileUrl.split(',')[1] || fileUrl;
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);

      finalFileUrl = `/uploads/sessions/${sessionId}/${safeFileName}`;
      finalStoragePath = `sessions/${sessionId}/${safeFileName}`;
    }

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        id: mediaId,
        sessionId: session.id,
        fileName,
        fileType: fileType.includes('video') || fileType === 'video' ? 'video' : 'image',
        fileUrl: finalFileUrl,
        storagePath: finalStoragePath,
        durationSeconds: durationSeconds ? parseFloat(durationSeconds) : null,
        status: 'uploaded',
        idempotencyKey,
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
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Media upload registration error:', error);
    return NextResponse.json({ error: 'Gagal mendaftarkan media asset.' }, { status: 500 });
  }
}
