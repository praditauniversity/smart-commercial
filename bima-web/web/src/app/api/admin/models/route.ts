import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encryptSecret, maskSecret } from '@/lib/security';

export async function GET() {
  try {
    await requireAuth(['admin']);
    const models = await prisma.modelConfig.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { detections: true } } },
    });

    const maskedModels = models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      modelName: m.modelName,
      endpointUrl: m.endpointUrl,
      isDefault: m.isDefault,
      isActive: m.isActive,
      apiKeyMasked: m.encryptedApiKey ? maskSecret(m.encryptedApiKey) : 'Tidak Dikonfigurasi',
      detectionsCount: m._count.detections,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    return NextResponse.json({ success: true, models: maskedModels });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('List models error:', error);
    return NextResponse.json({ error: 'Gagal mengambil konfigurasi model AI.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['admin']);
    const body = await request.json();

    const { name, provider, modelName, endpointUrl, apiKey, isDefault } = body;

    if (!name || !modelName) {
      return NextResponse.json(
        { error: 'Nama konfigurasi dan modelName wajib diisi.' },
        { status: 400 }
      );
    }

    const encryptedApiKey = apiKey ? encryptSecret(apiKey) : null;

    if (isDefault) {
      // Unset previous defaults
      await prisma.modelConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const newModel = await prisma.modelConfig.create({
      data: {
        name: name.trim(),
        provider: provider || 'OpenRouter',
        modelName: modelName.trim(),
        endpointUrl: endpointUrl?.trim() || null,
        encryptedApiKey,
        isDefault: Boolean(isDefault),
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_MODEL_CONFIG',
        entityType: 'ModelConfig',
        entityId: newModel.id,
        actorId: user.userId,
        changes: JSON.stringify({
          name: newModel.name,
          provider: newModel.provider,
          modelName: newModel.modelName,
          isDefault: newModel.isDefault,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      model: {
        ...newModel,
        apiKeyMasked: encryptedApiKey ? maskSecret(encryptedApiKey) : 'Tidak Dikonfigurasi',
        encryptedApiKey: undefined,
      },
    }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Create model error:', error);
    return NextResponse.json({ error: 'Gagal membuat konfigurasi model AI.' }, { status: 500 });
  }
}
