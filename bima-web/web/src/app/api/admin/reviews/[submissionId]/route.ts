import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isAcceptedFinding } from '@/lib/media-view';
import { summarizeReview } from '@/lib/review-summary';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    await requireAuth(['supervisor', 'admin']);
    const { submissionId } = await params;

    const submission = await prisma.submissionVersion.findUnique({
      where: { id: submissionId },
      include: {
        session: {
          include: {
            surveyor: { select: { id: true, name: true, email: true } },
            submissions: {
              orderBy: { versionNumber: 'desc' },
              include: { reviewer: { select: { id: true, name: true, email: true } } },
            },
            detections: {
              where: { isDeleted: false },
              include: {
                classDefinition: true,
                mediaAsset: true,
              },
            },
            mediaAssets: {
              where: { status: { not: 'deleted' } },
              include: { segments: true },
            },
          },
        },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Submission tidak ditemukan.' }, { status: 404 });
    }

    let snapshotData: any = {};
    try {
      snapshotData = JSON.parse(submission.snapshotData);
    } catch {}

    // Collect all related entity IDs across the entire session lifecycle
    const allSubmissionIds = (submission.session?.submissions || []).map((s: any) => s.id);
    const allDetectionIds = (submission.session?.detections || []).map((d: any) => d.id);
    const allMediaIds = (submission.session?.mediaAssets || []).map((m: any) => m.id);

    let snapshotDetectionIds: string[] = [];
    if (snapshotData?.detections) {
      snapshotDetectionIds = snapshotData.detections.map((d: any) => d.id).filter(Boolean);
    }

    const relevantEntityIds = Array.from(
      new Set([
        submission.sessionId,
        submissionId,
        ...allSubmissionIds,
        ...allDetectionIds,
        ...allMediaIds,
        ...snapshotDetectionIds,
      ])
    );

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: { in: relevantEntityIds } },
          { changes: { contains: submission.sessionId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    });

    // Hasil koreksi supervisor pada sesi (data saat ini, bukan snapshot): temuan benar / keliru / belum ditinjau + terlewat.
    const corrections = await prisma.officerCorrection.findMany({
      where: { sessionId: submission.sessionId, kind: { in: ['keliru', 'terlewat'] } },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    const missedClassIds = Array.from(new Set(corrections.filter((c) => c.classId).map((c) => c.classId as string)));
    const missedClasses = await prisma.classDefinition.findMany({ where: { id: { in: missedClassIds } }, select: { id: true, displayName: true } });
    const classNameById = new Map(missedClasses.map((c) => [c.id, c.displayName]));
    const mediaName = new Map((submission.session?.mediaAssets || []).map((m: any) => [m.id, m.fileName as string]));
    const lastWrongReason = new Map<string, string | null>();
    for (const c of corrections) if (c.kind === 'keliru' && c.detectionId && !lastWrongReason.has(c.detectionId)) lastWrongReason.set(c.detectionId, c.reason);
    const dets = submission.session?.detections || [];
    const toItem = (d: any) => ({
      id: d.id,
      displayName: d.classDefinition?.displayName ?? d.className,
      mediaFileName: mediaName.get(d.mediaAssetId) ?? null,
      frameIndex: d.frameIndex,
      timestampSeconds: d.timestampSeconds,
      confidence: d.confidence,
      band: d.priorityBand,
      score: d.riskScore,
      conditionLabel: d.conditionLabel,
      reviewStatus: d.reviewStatus,
      reason: lastWrongReason.get(d.id) ?? null,
    });
    const missed = corrections.filter((c) => c.kind === 'terlewat');
    const liveFindings = {
      counts: summarizeReview(dets.map((d: any) => d.reviewStatus), missed.length),
      benar: dets.filter((d: any) => isAcceptedFinding(d.reviewStatus)).map(toItem),
      keliru: dets.filter((d: any) => d.reviewStatus === 'keliru').map(toItem),
      belumDitinjau: dets.filter((d: any) => !isAcceptedFinding(d.reviewStatus) && d.reviewStatus !== 'keliru').map(toItem),
      terlewat: missed.map((c) => ({
        id: c.id,
        displayName: (c.classId && classNameById.get(c.classId)) || '-',
        mediaFileName: c.mediaAssetId ? mediaName.get(c.mediaAssetId) ?? null : null,
        timestampSeconds: c.timestampSeconds,
        reason: c.reason,
        actorName: c.actor?.name ?? null,
      })),
    };

    return NextResponse.json({
      success: true,
      submission: {
        ...submission,
        parsedSnapshot: snapshotData,
      },
      auditLogs,
      liveFindings,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Admin review detail error:', error);
    return NextResponse.json({ error: 'Gagal mengambil detail submission.' }, { status: 500 });
  }
}
