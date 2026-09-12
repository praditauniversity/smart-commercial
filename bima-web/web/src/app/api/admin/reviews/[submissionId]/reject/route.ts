import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateSurveySessionTransition, SurveySessionStatus } from '@/lib/state-machine';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const admin = await requireAuth(['admin']);
    const { submissionId } = await params;
    const { rejectReason, reviewNotes } = await request.json();

    if (!rejectReason || rejectReason.trim() === '') {
      return NextResponse.json(
        { error: 'Alasan penolakan survei wajib dipilih oleh admin.' },
        { status: 400 }
      );
    }

    const submission = await prisma.submissionVersion.findUnique({
      where: { id: submissionId },
      include: { session: true },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Submission tidak ditemukan.' }, { status: 404 });
    }

    const validation = validateSurveySessionTransition(
      submission.session.status as SurveySessionStatus,
      'ditolak',
      { role: admin.role, rejectReason }
    );

    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const [updatedSubmission, updatedSession] = await prisma.$transaction([
      prisma.submissionVersion.update({
        where: { id: submissionId },
        data: {
          status: 'ditolak',
          rejectReason: rejectReason.trim(),
          reviewNotes: reviewNotes || null,
          reviewedAt: new Date(),
          reviewerId: admin.userId,
        },
      }),
      prisma.surveySession.update({
        where: { id: submission.sessionId },
        data: {
          status: 'ditolak',
        },
      }),
      prisma.auditLog.create({
        data: {
          action: 'REJECT_SURVEY',
          entityType: 'SubmissionVersion',
          entityId: submissionId,
          actorId: admin.userId,
          changes: JSON.stringify({
            previousStatus: submission.status,
            newStatus: 'ditolak',
            rejectReason,
            reviewNotes,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Sesi survei ditolak dengan alasan yang tercatat. Surveyor dapat membuat revisi baru.',
      submission: updatedSubmission,
      session: updatedSession,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Reject submission error:', error);
    return NextResponse.json({ error: 'Gagal menolak sesi survei.' }, { status: 500 });
  }
}
