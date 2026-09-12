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
        mediaAssets: { where: { status: { not: 'deleted' } } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    const validation = validateSurveySessionTransition(
      session.status as SurveySessionStatus,
      'selesai_menunggu_submit'
    );

    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    // Check media statuses for informative warning
    const processingMedia = session.mediaAssets.filter((m) =>
      ['queued', 'uploading', 'processing'].includes(m.status)
    );
    const failedMedia = session.mediaAssets.filter((m) => m.status === 'failed');

    const updatedSession = await prisma.surveySession.update({
      where: { id },
      data: {
        status: 'selesai_menunggu_submit',
        finishedAt: new Date(),
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        action: 'SURVEYOR_END_SESSION',
        entityType: 'SurveySession',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: id,
          sessionName: session.name,
          actionDescription: 'Surveyor mengakhiri sesi survei di lapangan (Siap Submit).',
          previousStatus: session.status,
          newStatus: 'selesai_menunggu_submit',
        }),
      },
    });

    return NextResponse.json({
      success: true,
      session: updatedSession,
      warnings: {
        processingCount: processingMedia.length,
        failedCount: failedMedia.length,
        message:
          processingMedia.length > 0
            ? `Peringatan: Terdapat ${processingMedia.length} media yang masih diproses AI. Tunggu hingga selesai sebelum melakukan submit.`
            : undefined,
      },
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('End session error:', error);
    return NextResponse.json({ error: 'Gagal mengakhiri sesi survei.' }, { status: 500 });
  }
}
