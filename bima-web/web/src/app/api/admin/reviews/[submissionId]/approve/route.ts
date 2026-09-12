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
    const { notes } = await request.json().catch(() => ({ notes: '' }));

    const submission = await prisma.submissionVersion.findUnique({
      where: { id: submissionId },
      include: { session: true },
    });

    if (!submission) {
      return NextResponse.json({ error: 'Submission tidak ditemukan.' }, { status: 404 });
    }

    const validation = validateSurveySessionTransition(
      submission.session.status as SurveySessionStatus,
      'disetujui',
      { role: admin.role }
    );

    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const [updatedSubmission, updatedSession] = await prisma.$transaction([
      prisma.submissionVersion.update({
        where: { id: submissionId },
        data: {
          status: 'disetujui',
          reviewedAt: new Date(),
          reviewerId: admin.userId,
          reviewNotes: notes || 'Disetujui oleh admin.',
        },
      }),
      prisma.surveySession.update({
        where: { id: submission.sessionId },
        data: {
          status: 'disetujui',
        },
      }),
      prisma.auditLog.create({
        data: {
          action: 'APPROVE_SURVEY',
          entityType: 'SubmissionVersion',
          entityId: submissionId,
          actorId: admin.userId,
          changes: JSON.stringify({
            previousStatus: submission.status,
            newStatus: 'disetujui',
            notes,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Sesi survei berhasil disetujui dan data resmi masuk ke dashboard agregat.',
      submission: updatedSubmission,
      session: updatedSession,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Approve submission error:', error);
    return NextResponse.json({ error: 'Gagal menyetujui sesi survei.' }, { status: 500 });
  }
}
