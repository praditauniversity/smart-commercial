import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { summarizeReviewGroups } from '@/lib/review-summary';

export async function GET(request: Request) {
  try {
    await requireAuth(['supervisor', 'admin']);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'menunggu_review';

    const submissions = await prisma.submissionVersion.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: { submittedAt: 'desc' },
      include: {
        session: {
          include: {
            surveyor: { select: { id: true, name: true, email: true } },
          },
        },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    // Hasil koreksi supervisor dihitung dari data sesi saat ini (bukan snapshot saat submit):
    // benar / keliru / belum ditinjau dari Detection, terlewat dari OfficerCorrection.
    const sessionIds = Array.from(new Set(submissions.map((s) => s.sessionId)));
    const [detGroups, missedGroups] = await Promise.all([
      prisma.detection.groupBy({ by: ['sessionId', 'reviewStatus'], where: { sessionId: { in: sessionIds }, isDeleted: false }, _count: { _all: true } }),
      prisma.officerCorrection.groupBy({ by: ['sessionId'], where: { sessionId: { in: sessionIds }, kind: 'terlewat' }, _count: { _all: true } }),
    ]);
    const missedBySession = new Map(missedGroups.map((g) => [g.sessionId, g._count._all]));

    const formatted = submissions.map((sub) => {
      let snapshot: any = {};
      try {
        snapshot = JSON.parse(sub.snapshotData);
      } catch {}

      return {
        id: sub.id,
        sessionId: sub.sessionId,
        sessionName: sub.session?.name,
        surveyorName: sub.session?.surveyor?.name,
        surveyorEmail: sub.session?.surveyor?.email,
        versionNumber: sub.versionNumber,
        isResubmission: sub.versionNumber > 1,
        status: sub.status,
        submittedAt: sub.submittedAt,
        reviewedAt: sub.reviewedAt,
        reviewerName: sub.reviewer?.name,
        rejectReason: sub.rejectReason,
        reviewNotes: sub.reviewNotes,
        locationAddress: sub.session?.locationAddress,
        review: summarizeReviewGroups(
          detGroups.filter((g) => g.sessionId === sub.sessionId).map((g) => ({ reviewStatus: g.reviewStatus, count: g._count._all })),
          missedBySession.get(sub.sessionId) ?? 0
        ),
        stats: snapshot.stats || {
          totalMedia: 0,
          totalDetections: 0,
          layakCount: 0,
          cukupLayakCount: 0,
          tidakLayakCount: 0,
        },
      };
    });

    return NextResponse.json({ success: true, submissions: formatted });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Admin review queue error:', error);
    return NextResponse.json({ error: 'Gagal mengambil antrean review.' }, { status: 500 });
  }
}
