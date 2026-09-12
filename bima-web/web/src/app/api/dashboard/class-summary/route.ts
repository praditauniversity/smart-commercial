import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    await requireAuth(['admin']);
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    const approvedSessions = await prisma.surveySession.findMany({
      where: { status: 'disetujui' },
      select: { id: true, name: true, locationAddress: true, locationGeojson: true, surveyDate: true },
    });

    const sessionMap = new Map(approvedSessions.map((s) => [s.id, s]));
    const sessionIds = approvedSessions.map((s) => s.id);

    const where: any = {
      sessionId: { in: sessionIds },
      isDeleted: false,
    };
    if (classId && classId !== 'all') {
      where.classId = classId;
    }

    const detections = await prisma.detection.findMany({
      where,
      include: {
        classDefinition: true,
        mediaAsset: { select: { id: true, fileName: true, fileUrl: true, fileType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = detections.map((d) => {
      const session = sessionMap.get(d.sessionId);
      let bbox = { x: 0, y: 0, width: 0, height: 0 };
      try {
        bbox = JSON.parse(d.bbox);
      } catch {}

      return {
        id: d.id,
        sessionId: d.sessionId,
        sessionName: session?.name,
        locationAddress: session?.locationAddress,
        locationGeojson: d.locationGeojson || session?.locationGeojson,
        surveyDate: session?.surveyDate,
        classId: d.classId,
        className: d.className,
        displayName: d.classDefinition?.displayName || d.className,
        condition: d.condition,
        feasibility: d.feasibility,
        bbox,
        mediaUrl: d.mediaAsset?.fileUrl,
        mediaType: d.mediaAsset?.fileType,
        fileName: d.mediaAsset?.fileName,
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Class summary error:', error);
    return NextResponse.json({ error: 'Gagal mengambil ringkasan per kelas.' }, { status: 500 });
  }
}
