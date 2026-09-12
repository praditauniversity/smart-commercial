import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    await requireAuth(['admin']);
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const feasibility = searchParams.get('feasibility');

    const approvedSessions = await prisma.surveySession.findMany({
      where: { status: 'disetujui' },
      include: {
        surveyor: { select: { name: true, email: true } },
        detections: {
          where: {
            isDeleted: false,
            ...(classId && classId !== 'all' ? { classId } : {}),
            ...(feasibility && feasibility !== 'all' ? { feasibility } : {}),
          },
          include: {
            classDefinition: true,
            mediaAsset: { select: { fileUrl: true, fileType: true } },
          },
        },
      },
    });

    const points = [];

    for (const s of approvedSessions) {
      let sessionGeo: any = null;
      try {
        sessionGeo = typeof s.locationGeojson === 'string' ? JSON.parse(s.locationGeojson) : s.locationGeojson;
      } catch {}

      for (const d of s.detections) {
        let detectionGeo = null;
        if (d.locationGeojson) {
          try {
            detectionGeo = JSON.parse(d.locationGeojson);
          } catch {}
        }

        const geo = detectionGeo || sessionGeo;
        if (geo) {
          points.push({
            id: d.id,
            className: d.className,
            displayName: d.classDefinition?.displayName || d.className,
            condition: d.condition,
            feasibility: d.feasibility,
            sessionName: s.name,
            locationAddress: s.locationAddress,
            surveyDate: s.surveyDate,
            surveyorName: s.surveyor?.name,
            geometry: geo,
            mediaUrl: d.mediaAsset?.fileUrl,
            mediaType: d.mediaAsset?.fileType,
          });
        }
      }
    }

    return NextResponse.json({ success: true, points });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Dashboard map points error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data peta temuan.' }, { status: 500 });
  }
}
