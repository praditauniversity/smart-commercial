import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildMapMarkers } from '@/lib/map-points';
import type { PriorityBand } from '@/lib/risk';

const parse = (v: unknown) => {
  if (!v) return null;
  if (typeof v !== 'string') return v as any;
  try { return JSON.parse(v); } catch { return null; }
};

/**
 * Penanda peta untuk admin dan supervisor: satu penanda per lokasi sesi (atau koordinat temuan), diberi warna menurut
 * risiko terburuk di lokasi itu. Temuan berstatus "keliru" tidak dihitung. Filter opsional: status sesi.
 */
export async function GET(request: Request) {
  try {
    await requireAuth(['supervisor', 'admin']);
    const status = new URL(request.url).searchParams.get('status');

    const sessions = await prisma.surveySession.findMany({
      where: status ? { status } : {},
      select: {
        id: true, name: true, locationAddress: true, locationGeojson: true,
        surveyor: { select: { name: true } },
        detections: {
          where: { isDeleted: false, reviewStatus: { not: 'keliru' } },
          select: { className: true, priorityBand: true, riskScore: true, locationGeojson: true, classDefinition: { select: { displayName: true } } },
        },
      },
    });

    const markers = buildMapMarkers(sessions.map((s) => ({
      id: s.id,
      name: s.name,
      locationAddress: s.locationAddress,
      surveyorName: s.surveyor?.name ?? null,
      geo: parse(s.locationGeojson),
      detections: s.detections.map((d) => ({
        className: d.className,
        displayName: d.classDefinition.displayName,
        band: d.priorityBand as PriorityBand | null,
        score: d.riskScore,
        geo: parse(d.locationGeojson),
      })),
    })));

    return NextResponse.json({ success: true, markers });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Dashboard map points error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data peta temuan.' }, { status: 500 });
  }
}
