import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encryptSecret } from '@/lib/security';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const body = await request.json();

    const model = await prisma.modelConfig.findUnique({ where: { id } });
    if (!model) {
      return NextResponse.json({ error: 'Konfigurasi model tidak ditemukan.' }, { status: 404 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.provider !== undefined) updateData.provider = body.provider;
    if (body.modelName !== undefined) updateData.modelName = body.modelName.trim();
    if (body.endpointUrl !== undefined) updateData.endpointUrl = body.endpointUrl?.trim() || null;
    if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
      updateData.encryptedApiKey = encryptSecret(body.apiKey.trim());
    }
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

    const updated = await prisma.modelConfig.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_MODEL_CONFIG',
        entityType: 'ModelConfig',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({ previous: model, updated: updateData }),
      },
    });

    return NextResponse.json({ success: true, model: updated });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Update model error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui konfigurasi model.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;

    const model = await prisma.modelConfig.findUnique({
      where: { id },
      include: { _count: { select: { detections: true } } },
    });

    if (!model) {
      return NextResponse.json({ error: 'Konfigurasi model tidak ditemukan.' }, { status: 404 });
    }

    // If model has historical detections, soft delete (deactivate)
    if (model._count.detections > 0) {
      await prisma.modelConfig.update({
        where: { id },
        data: { isActive: false, isDefault: false },
      });
      return NextResponse.json({
        success: true,
        message: 'Konfigurasi model memiliki data historis, status berhasil dinonaktifkan (soft delete).',
        isSoftDeleted: true,
      });
    }

    await prisma.modelConfig.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'DELETE_MODEL_CONFIG',
        entityType: 'ModelConfig',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify(model),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Konfigurasi model berhasil dihapus.',
      isSoftDeleted: false,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Delete model error:', error);
    return NextResponse.json({ error: 'Gagal menghapus konfigurasi model.' }, { status: 500 });
  }
}
