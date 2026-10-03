import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { seesAllSurveyors } from '@/lib/access';
import { buildOverview, type OverviewSessionInput } from '@/lib/overview';
import type { PriorityBand } from '@/lib/risk';

/**
 * Ringkasan dashboard per peran: admin dan supervisor melihat semua surveyor; surveyor hanya sesinya sendiri
 * (dibatasi di server, bukan di klien). Filter: surveyorId (hanya admin/supervisor), zoneId, status.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const sp = new URL(request.url).searchParams;
    const all = seesAllSurveyors(user.role);

    const where: Record<string, unknown> = {};
    if (!all) where.surveyorId = user.userId;
    else if (sp.get('surveyorId')) where.surveyorId = sp.get('surveyorId');
    if (sp.get('zoneId')) where.zoneId = sp.get('zoneId');
    if (sp.get('status')) where.status = sp.get('status');

    const sessions = await prisma.surveySession.findMany({
      where,
      orderBy: { surveyDate: 'desc' },
      include: {
        surveyor: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true, exposure: true, isSimulated: true } },
        _count: { select: { mediaAssets: { where: { status: { not: 'deleted' } } }, missedFindings: { where: { kind: 'terlewat' } } } },
        detections: {
          where: { isDeleted: false },
          select: {
            className: true,
            priorityBand: true,
            riskScore: true,
            reviewStatus: true,
            conditionLabel: true,
            classDefinition: { select: { displayName: true, categoryGroup: true } },
          },
        },
      },
    });

    const inputs: OverviewSessionInput[] = sessions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      surveyDate: s.surveyDate.toISOString(),
      surveyor: s.surveyor,
      zone: s.zone,
      mediaCount: s._count.mediaAssets,
      missedCount: s._count.missedFindings,
      detections: s.detections.map((d) => ({
        className: d.className,
        displayName: d.classDefinition.displayName,
        group: d.classDefinition.categoryGroup,
        band: d.priorityBand as PriorityBand | null,
        score: d.riskScore,
        reviewStatus: d.reviewStatus,
        condition: d.conditionLabel,
      })),
    }));

    return NextResponse.json({ success: true, scope: all ? 'all' : 'own', ...buildOverview(inputs) });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Overview error:', error);
    return NextResponse.json({ error: 'Gagal mengambil ringkasan dashboard.' }, { status: 500 });
  }
}
