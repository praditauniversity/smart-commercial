import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { seesAllSurveyors } from '@/lib/access';
import { groupFindingsByFrame, type FindingRow } from '@/lib/dashboard-findings';
import type { PriorityBand } from '@/lib/risk';

const BANDS = ['rendah', 'sedang', 'tinggi', 'kritikal'];

/**
 * Panel gambar temuan di dashboard: gambar/frame dengan kotak deteksi, risiko tertinggi dulu.
 * Admin dan supervisor melihat semua surveyor; surveyor hanya sesinya sendiri (dibatasi di server).
 * Filter: className, band (rendah|sedang|tinggi|kritikal). Temuan berstatus "keliru" tidak ditampilkan.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const sp = new URL(request.url).searchParams;
    const className = sp.get('className') || undefined;
    const band = sp.get('band') || undefined;
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 12, 1), 24);
    if (band && !BANDS.includes(band)) return NextResponse.json({ error: 'Pita prioritas tidak valid.' }, { status: 400 });

    const where = {
      isDeleted: false,
      reviewStatus: { not: 'keliru' },
      ...(className ? { className } : {}),
      ...(band ? { priorityBand: band } : {}),
      mediaAsset: { status: { not: 'deleted' } },
      session: seesAllSurveyors(user.role) ? {} : { surveyorId: user.userId },
    };

    const [total, dets] = await Promise.all([
      prisma.detection.count({ where }),
      prisma.detection.findMany({
        where,
        orderBy: [{ riskScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 150,
        select: {
          id: true, sessionId: true, mediaAssetId: true, frameIndex: true, className: true, bbox: true, confidence: true,
          priorityBand: true, riskScore: true, conditionLabel: true,
          classDefinition: { select: { displayName: true } },
          session: { select: { name: true } },
          mediaAsset: { select: { fileType: true, fileUrl: true } },
        },
      }),
    ]);

    const mediaIds = [...new Set(dets.map((d) => d.mediaAssetId))];
    const frames = mediaIds.length
      ? await prisma.mediaFrame.findMany({ where: { mediaAssetId: { in: mediaIds } }, select: { mediaAssetId: true, frameIndex: true, imageUrl: true } })
      : [];
    const frameUrl = new Map(frames.map((f) => [`${f.mediaAssetId}:${f.frameIndex}`, f.imageUrl]));

    const rows: FindingRow[] = [];
    for (const d of dets) {
      let box;
      try { box = JSON.parse(d.bbox); } catch { continue; }
      const imageUrl = (d.frameIndex !== null ? frameUrl.get(`${d.mediaAssetId}:${d.frameIndex}`) : null)
        ?? (d.mediaAsset.fileType === 'image' ? d.mediaAsset.fileUrl : null);
      rows.push({
        id: d.id, sessionId: d.sessionId, sessionName: d.session.name, mediaAssetId: d.mediaAssetId, frameIndex: d.frameIndex,
        className: d.className, displayName: d.classDefinition.displayName, confidence: d.confidence,
        band: d.priorityBand as PriorityBand | null, score: d.riskScore, condition: d.conditionLabel, bbox: box, imageUrl,
      });
    }

    return NextResponse.json({ success: true, total, tiles: groupFindingsByFrame(rows, limit) });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Dashboard findings error:', error);
    return NextResponse.json({ error: 'Gagal mengambil gambar temuan.' }, { status: 500 });
  }
}
