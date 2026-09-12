import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: {
        classDefinition: true,
        mediaAsset: true,
        session: true,
        modelConfig: true,
      },
    });

    if (!detection || detection.isDeleted) {
      return NextResponse.json({ error: 'Deteksi tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && detection.session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, detection });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get detection error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data deteksi.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: {
        session: true,
        classDefinition: true,
        mediaAsset: true,
      },
    });

    if (!detection || detection.isDeleted) {
      return NextResponse.json({ error: 'Deteksi tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor') {
      if (detection.session.surveyorId !== user.userId) {
        return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
      }
      // Check session status: only editable in 'berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'
      const editableStatuses = ['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'];
      if (!editableStatuses.includes(detection.session.status)) {
        return NextResponse.json(
          { error: `Data deteksi tidak dapat diubah pada sesi berstatus "${detection.session.status}".` },
          { status: 400 }
        );
      }
    }

    const { classId, condition, feasibility, locationGeojson } = body;
    const updateData: any = {};
    let newClassObj: any = null;

    let isClassChanged = false;
    if (classId && classId !== detection.classId) {
      const cls = await prisma.classDefinition.findUnique({
        where: { id: classId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });

      if (!cls || !cls.isActive) {
        return NextResponse.json({ error: 'Kelas deteksi tidak valid atau nonaktif.' }, { status: 400 });
      }

      newClassObj = cls;
      updateData.classId = cls.id;
      updateData.className = cls.name;
      updateData.classVersionId = cls.versions[0]?.id || null;
      isClassChanged = true;
    }

    let isConditionChanged = false;
    if (condition !== undefined) {
      if (typeof condition !== 'string' || condition.trim() === '') {
        return NextResponse.json({ error: 'Deskripsi kondisi tidak boleh kosong.' }, { status: 400 });
      }
      const trimmedCondition = condition.trim();
      if (trimmedCondition !== (detection.condition || '').trim()) {
        updateData.condition = trimmedCondition;
        isConditionChanged = true;
      }
    }

    let isFeasibilityChanged = false;
    if (feasibility !== undefined) {
      const validFeasibilities = ['layak', 'cukup_layak', 'tidak_layak'];
      if (!validFeasibilities.includes(feasibility)) {
        return NextResponse.json({ error: 'Tingkat kelayakan tidak valid.' }, { status: 400 });
      }
      if (feasibility !== detection.feasibility) {
        updateData.feasibility = feasibility;
        isFeasibilityChanged = true;
      }
    }

    // Precise coordinate comparison for Location GeoJSON
    let prevCoords: [number, number] | null = null;
    let nextCoords: [number, number] | null = null;
    try {
      const pGeo = typeof detection.locationGeojson === 'string' ? JSON.parse(detection.locationGeojson) : detection.locationGeojson;
      if (pGeo && pGeo.type === 'Point' && Array.isArray(pGeo.coordinates)) {
        prevCoords = [pGeo.coordinates[0], pGeo.coordinates[1]];
      }
    } catch {}

    if (locationGeojson !== undefined) {
      try {
        const nGeo = typeof locationGeojson === 'string' ? JSON.parse(locationGeojson) : locationGeojson;
        if (nGeo && nGeo.type === 'Point' && Array.isArray(nGeo.coordinates)) {
          nextCoords = [nGeo.coordinates[0], nGeo.coordinates[1]];
        }
      } catch {}

      let isLocationChanged = false;
      if (prevCoords && nextCoords) {
        // Compare with 6 decimal places tolerance
        isLocationChanged =
          Math.abs(prevCoords[0] - nextCoords[0]) > 0.000001 ||
          Math.abs(prevCoords[1] - nextCoords[1]) > 0.000001;
      } else if (!prevCoords && nextCoords) {
        isLocationChanged = true;
      }

      if (isLocationChanged) {
        updateData.locationGeojson = typeof locationGeojson === 'object'
          ? JSON.stringify(locationGeojson)
          : locationGeojson;
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

    // Build precise diff for audit log
    const diffPrevious: Record<string, any> = {};
    const diffUpdated: Record<string, any> = {};
    const changedLabels: string[] = [];

    if (isClassChanged && newClassObj) {
      diffPrevious.className = detection.classDefinition?.displayName || detection.className;
      diffUpdated.className = newClassObj.displayName || newClassObj.name;
      changedLabels.push('kelas objek');
    }

    if (isConditionChanged) {
      diffPrevious.condition = detection.condition;
      diffUpdated.condition = updateData.condition;
      changedLabels.push('deskripsi kondisi');
    }

    if (isFeasibilityChanged) {
      diffPrevious.feasibility = detection.feasibility;
      diffUpdated.feasibility = updateData.feasibility;
      changedLabels.push('tingkat kelayakan');
    }

    if (updateData.locationGeojson && nextCoords) {
      diffPrevious.locationCoordinates = prevCoords ? [prevCoords[1], prevCoords[0]] : null;
      diffUpdated.locationCoordinates = [nextCoords[1], nextCoords[0]];
      changedLabels.push('titik peta lokasi');
    }

    // Only record audit log if there are actual changes
    if (changedLabels.length > 0) {
      const actionDescription = `Surveyor memperbarui ${changedLabels.join(', ')} pada temuan "${updated.classDefinition?.displayName || updated.className}".`;

      await prisma.auditLog.create({
        data: {
          action: user.role === 'admin' ? 'ADMIN_CORRECT_DETECTION' : 'SURVEYOR_EDIT_DETECTION',
          entityType: 'Detection',
          entityId: id,
          actorId: user.userId,
          changes: JSON.stringify({
            sessionId: detection.sessionId,
            mediaAssetId: detection.mediaAssetId,
            fileName: detection.mediaAsset?.fileName || 'File Media',
            targetName: updated.classDefinition?.displayName || updated.className,
            actionDescription,
            changedFields: changedLabels,
            previous: diffPrevious,
            updated: diffUpdated,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Perubahan deteksi berhasil disimpan.',
      detection: updated,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update detection error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui data deteksi.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: {
        session: true,
        classDefinition: true,
        mediaAsset: true,
      },
    });

    if (!detection || detection.isDeleted) {
      return NextResponse.json({ error: 'Deteksi tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor') {
      if (detection.session.surveyorId !== user.userId) {
        return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
      }
      const editableStatuses = ['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'];
      if (!editableStatuses.includes(detection.session.status)) {
        return NextResponse.json(
          { error: `Deteksi tidak dapat dihapus pada status "${detection.session.status}".` },
          { status: 400 }
        );
      }
    }

    await prisma.detection.update({
      where: { id },
      data: { isDeleted: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'SURVEYOR_DELETE_DETECTION',
        entityType: 'Detection',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: detection.sessionId,
          mediaAssetId: detection.mediaAssetId,
          fileName: detection.mediaAsset?.fileName,
          targetName: detection.classDefinition?.displayName || detection.className,
          actionDescription: `Surveyor menghapus objek temuan "${detection.classDefinition?.displayName || detection.className}" dari file ${detection.mediaAsset?.fileName || ''}.`,
          isDeleted: true,
        }),
      },
    });

    return NextResponse.json({ success: true, message: 'Deteksi berhasil dihapus.' });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete detection error:', error);
    return NextResponse.json({ error: 'Gagal menghapus deteksi.' }, { status: 500 });
  }
}
