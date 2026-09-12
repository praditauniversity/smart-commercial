import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma, { withDbRetry } from '@/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const session = await withDbRetry(() =>
      prisma.surveySession.findUnique({
        where: { id },
        include: {
          surveyor: { select: { id: true, name: true, email: true } },
          mediaAssets: {
            where: { status: { not: 'deleted' } },
            orderBy: { createdAt: 'desc' },
            include: {
              segments: true,
              _count: { select: { detections: { where: { isDeleted: false } } } },
            },
          },
          submissions: {
            orderBy: { versionNumber: 'desc' },
            include: { reviewer: { select: { id: true, name: true, email: true } } },
          },
          detections: {
            where: { isDeleted: false },
            include: {
              classDefinition: true,
              mediaAsset: { select: { id: true, fileName: true, fileType: true, fileUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
    );

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, session });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get session error:', error);
    return NextResponse.json({ error: 'Gagal mengambil detail sesi survei.' }, { status: 500 });
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

    const session = await prisma.surveySession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    // Only allow editing metadata when status is 'berlangsung', 'selesai_menunggu_submit', or 'perlu_perbaikan'
    if (!['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'].includes(session.status)) {
      return NextResponse.json(
        { error: `Metadata sesi tidak dapat diedit saat status "${session.status}".` },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.locationType !== undefined) updateData.locationType = body.locationType;
    if (body.locationGeojson !== undefined) {
      updateData.locationGeojson =
        typeof body.locationGeojson === 'string'
          ? body.locationGeojson
          : JSON.stringify(body.locationGeojson);
    }
    if (body.locationAddress !== undefined) updateData.locationAddress = body.locationAddress;
    if (body.surveyDate !== undefined) updateData.surveyDate = new Date(body.surveyDate);

    const updated = await prisma.surveySession.update({
      where: { id },
      data: updateData,
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_SESSION_METADATA',
        entityType: 'SurveySession',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: id,
          sessionName: updated.name,
          actionDescription: 'Surveyor memperbarui informasi metadata sesi survei (nama/alamat).',
          previous: {
            name: session.name,
            locationAddress: session.locationAddress,
            locationType: session.locationType,
          },
          updated: updateData,
        }),
      },
    });

    return NextResponse.json({ success: true, session: updated });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update session error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui metadata sesi survei.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const session = await prisma.surveySession.findUnique({
      where: { id },
      include: { submissions: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    // Do not allow hard deleting if already submitted or approved
    if (session.submissions.length > 0 && session.status !== 'berlangsung' && session.status !== 'selesai_menunggu_submit') {
      return NextResponse.json(
        { error: 'Sesi survei yang sudah pernah disubmit atau direview tidak dapat dihapus.' },
        { status: 400 }
      );
    }

    await prisma.surveySession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Sesi survei berhasil dihapus permanen.' });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete session error:', error);
    return NextResponse.json({ error: 'Gagal menghapus sesi survei.' }, { status: 500 });
  }
}
