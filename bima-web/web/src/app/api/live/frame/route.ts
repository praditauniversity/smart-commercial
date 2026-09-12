import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { decryptSecret } from '@/lib/security';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://127.0.0.1:8000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'bima-research-internal-secret-2026';

export async function POST(request: Request) {
  try {
    await requireAuth();
    const { frameBase64 } = await request.json();

    if (!frameBase64) {
      return NextResponse.json({ error: 'Frame data is required' }, { status: 400 });
    }

    const activeClasses = await prisma.classDefinition.findMany({
      where: { isActive: true },
    });

    const modelConfig = await prisma.modelConfig.findFirst({
      where: { isDefault: true, isActive: true },
    }) || await prisma.modelConfig.findFirst({
      where: { isActive: true },
    });

    if (!modelConfig) {
      return NextResponse.json({ detections: [] });
    }

    const decryptedKey = modelConfig.encryptedApiKey
      ? decryptSecret(modelConfig.encryptedApiKey)
      : null;

    if (modelConfig.provider.toLowerCase() === 'openrouter' && (!decryptedKey || decryptedKey.trim() === '')) {
      return NextResponse.json({ detections: [], message: 'OpenRouter API Key belum dikonfigurasi' });
    }

    const payload = {
      frame_base64: frameBase64.replace(/^data:image\/\w+;base64,/, ''),
      active_classes: activeClasses.map((c) => ({
        id: c.id,
        name: c.name,
        display_name: c.displayName,
        visual_description: c.visualDescription,
        condition_criteria: c.conditionCriteria,
        feasibility_criteria: c.feasibilityCriteria,
        mutually_exclusive_with: JSON.parse(c.mutuallyExclusiveWith || '[]'),
        conflict_iou_threshold: c.conflictIouThreshold,
      })),
      ai_model_config: {
        provider: modelConfig.provider,
        model_name: modelConfig.modelName,
        endpoint_url: modelConfig.endpointUrl || null,
        api_key: decryptedKey,
      },
    };

    const res = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/live-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return NextResponse.json({ detections: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Live frame proxy error:', error);
    return NextResponse.json({ detections: [] });
  }
}
