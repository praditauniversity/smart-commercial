import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateSurveySessionTransition, SurveySessionStatus } from '@/lib/state-machine';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const session = await prisma.surveySession.findUnique({
      where: { id },
      include: {
        surveyor: { select: { id: true, name: true, email: true } },
        mediaAssets: {
          where: { status: { not: 'deleted' } },
          include: { segments: true },
        },
        detections: {
          where: { isDeleted: false },
          include: { classDefinition: true },
        },
        submissions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    const processingCount = session.mediaAssets.filter((m) =>
      ['queued', 'uploading', 'processing'].includes(m.status)
    ).length;
    const failedCount = session.mediaAssets.filter((m) => m.status === 'failed').length;
    const unresolvedConflictCount = session.detections.filter(
      (d) => d.hasConflict && !d.conflictResolved
    ).length;

    const validation = validateSurveySessionTransition(
      session.status as SurveySessionStatus,
      'menunggu_review',
      {
        processingMediaCount: processingCount,
        failedMediaCount: failedCount,
        unresolvedConflictCount: unresolvedConflictCount,
        role: user.role,
      }
    );

    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const nextVersionNumber =
      session.submissions.length > 0 ? session.submissions[0].versionNumber + 1 : 2;

    const snapshotData = {
      versionNumber: nextVersionNumber,
      submittedAt: new Date().toISOString(),
      submittedBy: {
        id: user.userId,
        name: user.name,
        email: user.email,
      },
      session: {
        id: session.id,
        name: session.name,
        locationType: session.locationType,
        locationGeojson: session.locationGeojson,
        locationAddress: session.locationAddress,
        surveyDate: session.surveyDate,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
      },
      mediaAssets: session.mediaAssets.map((m) => ({
        id: m.id,
        fileName: m.fileName,
        fileType: m.fileType,
        fileUrl: m.fileUrl,
        storagePath: m.storagePath,
        durationSeconds: m.durationSeconds,
        status: m.status,
      })),
      detections: session.detections.map((d) => ({
        id: d.id,
        mediaAssetId: d.mediaAssetId,
        mediaSegmentId: d.mediaSegmentId,
        classId: d.classId,
        className: d.className,
        displayName: d.classDefinition?.displayName,
        bbox: JSON.parse(d.bbox || '{}'),
        condition: d.condition,
        feasibility: d.feasibility,
        timestampSeconds: d.timestampSeconds,
        frameIndex: d.frameIndex,
        locationGeojson: d.locationGeojson,
        modelConfigId: d.modelConfigId,
        modelName: d.modelName,
        promptVersion: d.promptVersion,
        hasConflict: d.hasConflict,
        conflictResolved: d.conflictResolved,
        conflictDetails: JSON.parse(d.conflictDetails || '{}'),
      })),
      stats: {
        totalMedia: session.mediaAssets.length,
        totalDetections: session.detections.length,
        layakCount: session.detections.filter((d) => d.feasibility === 'layak').length,
        cukupLayakCount: session.detections.filter((d) => d.feasibility === 'cukup_layak').length,
        tidakLayakCount: session.detections.filter((d) => d.feasibility === 'tidak_layak').length,
      },
    };

    const [submissionVersion, updatedSession] = await prisma.$transaction([
      prisma.submissionVersion.create({
        data: {
          sessionId: session.id,
          versionNumber: nextVersionNumber,
          status: 'menunggu_review',
          snapshotData: JSON.stringify(snapshotData),
          submittedAt: new Date(),
        },
      }),
      prisma.surveySession.update({
        where: { id: session.id },
        data: {
          status: 'menunggu_review',
        },
      }),
      prisma.auditLog.create({
        data: {
          action: 'SURVEYOR_RESUBMIT_REVISION',
          entityType: 'SubmissionVersion',
          entityId: session.id,
          actorId: user.userId,
          changes: JSON.stringify({
            sessionId: session.id,
            sessionName: session.name,
            versionNumber: nextVersionNumber,
            actionDescription: `Surveyor mengajukan kembali revisi hasil survei (Versi Snapshot: ${nextVersionNumber}).`,
            totalMedia: session.mediaAssets.length,
            totalDetections: session.detections.length,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Revisi Versi ${nextVersionNumber} berhasil dikirim ke admin.`,
      submissionVersion,
      session: updatedSession,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Resubmit session error:', error);
    return NextResponse.json({ error: 'Gagal melakukan re-submit revisi.' }, { status: 500 });
  }
}
