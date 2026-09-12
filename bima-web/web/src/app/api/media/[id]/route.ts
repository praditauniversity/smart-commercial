import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: { session: true },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: 'Media asset tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && mediaAsset.session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    if (!['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'].includes(mediaAsset.session.status)) {
      return NextResponse.json(
        { error: `Tidak dapat menghapus media saat status sesi "${mediaAsset.session.status}".` },
        { status: 400 }
      );
    }

    // Cascade delete detections and segments, record audit log, then delete mediaAsset
    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          action: 'SURVEYOR_DELETE_MEDIA',
          entityType: 'MediaAsset',
          entityId: mediaAsset.sessionId,
          actorId: user.userId,
          changes: JSON.stringify({
            sessionId: mediaAsset.sessionId,
            sessionName: mediaAsset.session.name,
            fileName: mediaAsset.fileName,
            fileType: mediaAsset.fileType,
            actionDescription: `Surveyor menghapus media file "${mediaAsset.fileName}" beserta seluruh deteksi terkait.`,
          }),
        },
      }),
      prisma.detection.deleteMany({ where: { mediaAssetId: id } }),
      prisma.mediaSegment.deleteMany({ where: { mediaAssetId: id } }),
      prisma.mediaAsset.delete({ where: { id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Media asset beserta seluruh deteksi terkait berhasil dihapus permanen.',
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete media error:', error);
    return NextResponse.json({ error: 'Gagal menghapus media asset.' }, { status: 500 });
  }
}
