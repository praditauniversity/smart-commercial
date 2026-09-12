import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/security';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://127.0.0.1:8000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'bima-research-internal-secret-2026';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: 'Media asset tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && mediaAsset.session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    // Mark as processing
    await prisma.mediaAsset.update({
      where: { id },
      data: { status: 'processing', errorMessage: null },
    });

    // 1. Fetch active class definitions with current versions
    const activeClasses = await prisma.classDefinition.findMany({
      where: { isActive: true },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    // 2. Fetch default active ModelConfig
    let modelConfig = await prisma.modelConfig.findFirst({
      where: { isDefault: true, isActive: true },
    });

    if (!modelConfig) {
      modelConfig = await prisma.modelConfig.findFirst({
        where: { isActive: true },
      });
    }

    if (!modelConfig) {
      await prisma.mediaAsset.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: 'Tidak ada Model AI aktif yang dikonfigurasi. Hubungi Admin untuk mengaktifkan model.',
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Tidak ada Model AI aktif yang dikonfigurasi.',
          mediaAssetId: id,
          status: 'failed',
        },
        { status: 400 }
      );
    }

    let decryptedKey = modelConfig.encryptedApiKey
      ? decryptSecret(modelConfig.encryptedApiKey)
      : null;

    if ((!decryptedKey || decryptedKey.trim() === '') && process.env.OPEN_ROUTER_API_KEY && modelConfig.provider.toLowerCase() === 'openrouter') {
      decryptedKey = process.env.OPEN_ROUTER_API_KEY.trim();
      const encrypted = encryptSecret(decryptedKey);
      await prisma.modelConfig.update({
        where: { id: modelConfig.id },
        data: { encryptedApiKey: encrypted },
      });
    }

    if (modelConfig.provider.toLowerCase() === 'openrouter' && (!decryptedKey || decryptedKey.trim() === '')) {
      await prisma.mediaAsset.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: 'OpenRouter API Key belum dikonfigurasi pada Model AI aktif. Silakan masukkan API Key pada menu Pengaturan Model AI oleh Admin.',
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'OpenRouter API Key belum dikonfigurasi pada Model AI aktif. Silakan konfigurasi API Key terlebih dahulu.',
          mediaAssetId: id,
          status: 'failed',
        },
        { status: 400 }
      );
    }

    // 3. Prepare payload for FastAPI AI worker
    const aiPayload = {
      session_id: mediaAsset.sessionId,
      media_asset_id: mediaAsset.id,
      file_url: mediaAsset.fileUrl,
      file_type: mediaAsset.fileType,
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
      idempotency_key: mediaAsset.idempotencyKey,
      conflict_threshold: 0.5,
    };

    // 4. Call FastAPI
    let workerResult: any = null;
    try {
      const workerResponse = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/process-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': INTERNAL_API_SECRET,
        },
        body: JSON.stringify(aiPayload),
      });

      if (!workerResponse.ok) {
        const errorText = await workerResponse.text();
        throw new Error(`Worker HTTP ${workerResponse.status}: ${errorText}`);
      }

      workerResult = await workerResponse.json();
    } catch (workerErr: any) {
      console.error('Worker dispatch error:', workerErr);
      await prisma.mediaAsset.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: `AI Processing Worker Error: ${workerErr.message}`,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Gagal memproses media AI: ${workerErr.message}`,
          mediaAssetId: id,
          status: 'failed',
        },
        { status: 502 }
      );
    }

    if (!workerResult.success) {
      await prisma.mediaAsset.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: workerResult.error_message || 'Gagal memproses deteksi AI',
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: workerResult.error_message || 'Gagal memproses deteksi AI',
          mediaAssetId: id,
          status: 'failed',
        },
        { status: 500 }
      );
    }

    // 5. Save segments and detections idempotently in a transaction
    await prisma.$transaction(async (tx) => {
      // Clear old segments and detections for this mediaAsset
      await tx.detection.deleteMany({ where: { mediaAssetId: id } });
      await tx.mediaSegment.deleteMany({ where: { mediaAssetId: id } });

      // Create segments
      const segmentMap: Record<number, string> = {};
      for (const seg of workerResult.segments || []) {
        const createdSeg = await tx.mediaSegment.create({
          data: {
            mediaAssetId: id,
            segmentIndex: seg.segment_index,
            startTime: seg.start_time,
            endTime: seg.end_time,
            mediaUrl: seg.media_url || mediaAsset.fileUrl,
            status: seg.status,
            extractionMetadata: JSON.stringify(seg.extraction_metadata || {}),
          },
        });
        segmentMap[seg.segment_index] = createdSeg.id;
      }

      // Create detections
      for (const det of workerResult.detections || []) {
        const matchingClass = activeClasses.find(
          (c) => c.id === det.class_id || c.name === det.class_name
        );
        const classId = matchingClass ? matchingClass.id : det.class_id;
        const classVersionId = matchingClass?.versions?.[0]?.id || null;

        const segIndex = det.timestamp_seconds ? Math.floor(det.timestamp_seconds / 10) : 0;
        const segmentId = segmentMap[segIndex] || (Object.values(segmentMap)[0] ?? null);

        await tx.detection.create({
          data: {
            sessionId: mediaAsset.sessionId,
            mediaAssetId: id,
            mediaSegmentId: segmentId,
            classId,
            classVersionId,
            className: det.class_name,
            bbox: JSON.stringify(det.bbox),
            condition: det.condition,
            feasibility: det.feasibility,
            timestampSeconds: det.timestamp_seconds,
            frameIndex: det.frame_index,
            locationGeojson: mediaAsset.session.locationGeojson,
            modelConfigId: modelConfig?.id || null,
            modelName: modelConfig?.modelName || 'qwen/qwen3-vl-8b-instruct',
            promptVersion: 'v1.0',
            hasConflict: det.has_conflict || false,
            conflictResolved: false,
            conflictDetails: JSON.stringify(det.conflict_details || {}),
            isDeleted: false,
          },
        });
      }

      // Mark media as completed
      await tx.mediaAsset.update({
        where: { id },
        data: {
          status: 'completed',
          errorMessage: null,
        },
      });
    });

    const refreshedDetections = await prisma.detection.findMany({
      where: { mediaAssetId: id, isDeleted: false },
      include: { classDefinition: true },
    });

    return NextResponse.json({
      success: true,
      mediaAssetId: id,
      status: 'completed',
      detectionsCount: refreshedDetections.length,
      detections: refreshedDetections,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Process media error:', error);
    return NextResponse.json({ error: 'Gagal memproses media.' }, { status: 500 });
  }
}
