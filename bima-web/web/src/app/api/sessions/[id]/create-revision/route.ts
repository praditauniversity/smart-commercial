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
    });

    if (!session) {
      return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    const validation = validateSurveySessionTransition(
      session.status as SurveySessionStatus,
      'perlu_perbaikan'
    );

    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const updatedSession = await prisma.surveySession.update({
      where: { id },
      data: {
        status: 'perlu_perbaikan',
      },
    });

    // Record audit log for starting revision
    await prisma.auditLog.create({
      data: {
        action: 'SURVEYOR_START_REVISION',
        entityType: 'SurveySession',
        entityId: id,
        actorId: user.userId,
        changes: JSON.stringify({
          sessionId: id,
          sessionName: session.name,
          actionDescription: 'Surveyor mengaktifkan mode revisi perbaikan hasil survei.',
          previousStatus: session.status,
          newStatus: 'perlu_perbaikan',
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Draft revisi berhasil dibuat. Anda dapat memperbarui media atau metadata sebelum re-submit.',
      session: updatedSession,
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create revision error:', error);
    return NextResponse.json({ error: 'Gagal membuat revisi sesi survei.' }, { status: 500 });
  }
}
