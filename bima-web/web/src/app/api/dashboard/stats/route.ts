import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    await requireAuth(['admin']);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const classId = searchParams.get('classId');

    const sessionWhere: any = { status: 'disetujui' };
    if (startDate || endDate) {
      sessionWhere.surveyDate = {};
      if (startDate) sessionWhere.surveyDate.gte = new Date(startDate);
      if (endDate) sessionWhere.surveyDate.lte = new Date(endDate);
    }

    const approvedSessions = await prisma.surveySession.findMany({
      where: sessionWhere,
      select: { id: true },
    });

    const sessionIds = approvedSessions.map((s) => s.id);

    const detectionWhere: any = {
      sessionId: { in: sessionIds },
      isDeleted: false,
    };
    if (classId && classId !== 'all') {
      detectionWhere.classId = classId;
    }

    const detections = await prisma.detection.findMany({
      where: detectionWhere,
      include: { classDefinition: true },
    });

    const feasibilityCounts = {
      layak: detections.filter((d) => d.feasibility === 'layak').length,
      cukup_layak: detections.filter((d) => d.feasibility === 'cukup_layak').length,
      tidak_layak: detections.filter((d) => d.feasibility === 'tidak_layak').length,
    };

    const classCountsMap: Record<string, { name: string; displayName: string; count: number; tidakLayak: number }> = {};
    for (const d of detections) {
      const cId = d.classId;
      if (!classCountsMap[cId]) {
        classCountsMap[cId] = {
          name: d.className,
          displayName: d.classDefinition?.displayName || d.className,
          count: 0,
          tidakLayak: 0,
        };
      }
      classCountsMap[cId].count += 1;
      if (d.feasibility === 'tidak_layak') {
        classCountsMap[cId].tidakLayak += 1;
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalApprovedSessions: sessionIds.length,
        totalFindings: detections.length,
        feasibility: feasibilityCounts,
        byClass: Object.values(classCountsMap),
      },
    });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Gagal mengambil statistik dashboard.' }, { status: 500 });
  }
}
