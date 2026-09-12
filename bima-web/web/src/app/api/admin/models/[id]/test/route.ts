import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { decryptSecret } from '@/lib/security';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://127.0.0.1:8000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'bima-research-internal-secret-2026';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['admin']);
    const { id } = await params;

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
