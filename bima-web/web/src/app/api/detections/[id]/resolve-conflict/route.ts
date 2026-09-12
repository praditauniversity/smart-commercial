import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { chosenClassId, chosenClassName } = await request.json();

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: { session: true },
    });

    if (!detection) {
      return NextResponse.json({ error: 'Data deteksi tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && detection.session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    const updateData: any = {
      conflictResolved: true,
      hasConflict: false,
    };

    if (chosenClassId) {
      const cls = await prisma.classDefinition.findUnique({
        where: { id: chosenClassId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });

      if (cls) {
        updateData.classId = cls.id;
        updateData.className = cls.name;
        updateData.classVersionId = cls.versions[0]?.id || null;
      }
    } else if (chosenClassName) {
      const cls = await prisma.classDefinition.findUnique({
        where: { name: chosenClassName },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });

      if (cls) {
        updateData.classId = cls.id;
        updateData.className = cls.name;
        updateData.classVersionId = cls.versions[0]?.id || null;
      }
    }

    const updated = await prisma.detection.update({
      where: { id },
      data: updateData,
      include: {
        classDefinition: true,
        mediaAsset: true,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        action: 'RESOLVE_CONFLICT',
        entityType: 'Detection',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: detection.sessionId,
          mediaAssetId: detection.mediaAssetId,
          fileName: updated.mediaAsset?.fileName || 'File Media',
          chosenClass: updated.classDefinition?.displayName || updated.className,
          actionDescription: `Surveyor menyelesaikan konflik kelas dan menetapkan kelas "${updated.classDefinition?.displayName || updated.className}".`,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Konflik kelas berhasil diselesaikan.',
      detection: updated,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Resolve conflict error:', error);
    return NextResponse.json({ error: 'Gagal menyelesaikan konflik kelas.' }, { status: 500 });
  }
}
