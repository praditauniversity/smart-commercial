import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;

    const model = await prisma.modelConfig.findUnique({ where: { id } });
    if (!model) {
      return NextResponse.json({ error: 'Konfigurasi model tidak ditemukan.' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.modelConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      prisma.modelConfig.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      }),
      prisma.auditLog.create({
        data: {
          action: 'SET_DEFAULT_MODEL',
          entityType: 'ModelConfig',
          entityId: id,
          actorId: user.userId,
          changes: JSON.stringify({ modelName: model.modelName, name: model.name }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Model "${model.name}" berhasil ditetapkan sebagai model default aktif.`,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Set default model error:', error);
    return NextResponse.json({ error: 'Gagal mengatur model default.' }, { status: 500 });
  }
}
