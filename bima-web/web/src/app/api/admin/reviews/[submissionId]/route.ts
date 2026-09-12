import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    await requireAuth(['admin']);
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

    return NextResponse.json({
      success: true,
      submission: {
        ...submission,
        parsedSnapshot: snapshotData,
      },
      auditLogs,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Admin review detail error:', error);
    return NextResponse.json({ error: 'Gagal mengambil detail submission.' }, { status: 500 });
  }
}
