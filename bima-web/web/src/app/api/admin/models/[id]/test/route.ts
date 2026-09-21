import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { decryptSecret } from '@/lib/security';
import { requireEnv } from '@/lib/env';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['admin']);
    const { id } = await params;
    const FASTAPI_SERVICE_URL = requireEnv('FASTAPI_SERVICE_URL');
    const INTERNAL_API_SECRET = requireEnv('INTERNAL_API_SECRET');

    const model = await prisma.modelConfig.findUnique({ where: { id } });
    if (!model) {
      return NextResponse.json({ error: 'Konfigurasi model tidak ditemukan.' }, { status: 404 });
    }

    const decryptedKey = model.encryptedApiKey ? decryptSecret(model.encryptedApiKey) : null;

    const payload = {
      ai_model_config: {
        provider: model.provider,
        model_name: model.modelName,
        endpoint_url: model.endpointUrl,
        api_key: decryptedKey,
      },
    };

    const res = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: false, message: `Worker test failed: ${err}` });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Test model connection error:', error);
    return NextResponse.json(
      { success: false, message: `Gagal melakukan test koneksi: ${error.message}` },
      { status: 500 }
    );
  }
}
