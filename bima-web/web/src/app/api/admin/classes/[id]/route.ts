import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { invalidateClassCache } from '@/lib/classCache';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const body = await request.json();

    const currentClass = await prisma.classDefinition.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!currentClass) {
      return NextResponse.json({ error: 'Kelas tidak ditemukan.' }, { status: 404 });
    }

    const updateData: any = {};
    let shouldCreateVersion = false;

    if (body.displayName !== undefined) {
      updateData.displayName = body.displayName.trim();
      shouldCreateVersion = true;
    }
    if (body.visualDescription !== undefined) {
      updateData.visualDescription = body.visualDescription.trim();
      shouldCreateVersion = true;
    }
    if (body.conditionCriteria !== undefined) {
      updateData.conditionCriteria = body.conditionCriteria.trim();
      shouldCreateVersion = true;
    }
    if (body.feasibilityCriteria !== undefined) {
      updateData.feasibilityCriteria = body.feasibilityCriteria.trim();
      shouldCreateVersion = true;
    }
    if (body.mutuallyExclusiveWith !== undefined) {
      updateData.mutuallyExclusiveWith =
        typeof body.mutuallyExclusiveWith === 'string'
          ? body.mutuallyExclusiveWith
          : JSON.stringify(body.mutuallyExclusiveWith);
    }
    if (body.conflictIouThreshold !== undefined) {
      updateData.conflictIouThreshold = parseFloat(body.conflictIouThreshold);
    }
    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    const updated = await prisma.classDefinition.update({
      where: { id },
      data: updateData,
    });

    // If definition content changed, create new version snapshot
    if (shouldCreateVersion) {
      const nextVersion = (currentClass.versions[0]?.versionNumber || 1) + 1;
      await prisma.classDefinitionVersion.create({
        data: {
          classId: id,
          versionNumber: nextVersion,
          snapshotData: JSON.stringify({
            name: updated.name,
            displayName: updated.displayName,
            visualDescription: updated.visualDescription,
            conditionCriteria: updated.conditionCriteria,
            feasibilityCriteria: updated.feasibilityCriteria,
          }),
        },
      });
    }

    // Invalidate cache
    invalidateClassCache();

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_CLASS',
        entityType: 'ClassDefinition',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({ previous: currentClass, updated }),
      },
    });

    const refreshed = await prisma.classDefinition.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    return NextResponse.json({ success: true, class: refreshed });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Update class error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui kelas deteksi.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;

    const classDef = await prisma.classDefinition.findUnique({
      where: { id },
      include: { _count: { select: { detections: true } } },
    });

    if (!classDef) {
      return NextResponse.json({ error: 'Kelas tidak ditemukan.' }, { status: 404 });
    }

    // If used in historical detections, perform soft delete (deactivate)
    if (classDef._count.detections > 0) {
      await prisma.classDefinition.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        message: 'Kelas memiliki data historis deteksi, status berhasil dinonaktifkan (soft delete).',
        isSoftDeleted: true,
      });
    }

    await prisma.classDefinition.delete({
      where: { id },
    });

    invalidateClassCache();

    await prisma.auditLog.create({
      data: {
        action: 'DELETE_CLASS',
        entityType: 'ClassDefinition',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify(classDef),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Kelas deteksi berhasil dihapus.',
      isSoftDeleted: false,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Delete class error:', error);
    return NextResponse.json({ error: 'Gagal menghapus kelas deteksi.' }, { status: 500 });
  }
}
