import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['admin']);
    const { id } = await params;
    const { classId, condition, feasibility, notes } = await request.json();

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: { session: true, classDefinition: true },
    });

    if (!detection) {
      return NextResponse.json({ error: 'Deteksi tidak ditemukan.' }, { status: 404 });
    }

    const previousState = {
      classId: detection.classId,
      className: detection.className,
      condition: detection.condition,
      feasibility: detection.feasibility,
    };

    const updateData: any = {};

    if (classId && classId !== detection.classId) {
      const cls = await prisma.classDefinition.findUnique({
        where: { id: classId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      if (cls) {
        updateData.classId = cls.id;
        updateData.className = cls.name;
        updateData.classVersionId = cls.versions[0]?.id || null;
      }
    }

    if (condition !== undefined) updateData.condition = condition;
    if (feasibility !== undefined) updateData.feasibility = feasibility;

    const [updatedDetection] = await prisma.$transaction([
      prisma.detection.update({
        where: { id },
        data: updateData,
        include: { classDefinition: true },
      }),
      prisma.auditLog.create({
        data: {
          action: 'CORRECT_DETECTION',
          entityType: 'Detection',
          entityId: id,
          actorId: admin.userId,
          changes: JSON.stringify({
            previous: previousState,
            updated: updateData,
            notes: notes || 'Admin correction during review stage',
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Koreksi deteksi berhasil disimpan dan dicatat dalam audit log.',
      detection: updatedDetection,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Admin edit detection error:', error);
    return NextResponse.json({ error: 'Gagal mengoreksi data deteksi.' }, { status: 500 });
  }
}
