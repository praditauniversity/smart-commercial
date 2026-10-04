import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Menandai temuan yang TERLEWAT oleh model (false negative). Ini pernyataan petugas, bukan keluaran model,
 * sehingga disimpan sebagai OfficerCorrection (kind = "terlewat") dan tidak membuat Detection.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['supervisor', 'admin']);
    const { id } = await params;
    const { classId, mediaAssetId, timestampSeconds, bbox, reason } = (await request.json()) ?? {};

    const session = await prisma.surveySession.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ error: 'Sesi survei tidak ditemukan.' }, { status: 404 });

    const cls = await prisma.classDefinition.findUnique({ where: { id: String(classId ?? '') } });
    if (!cls || !cls.isActive) {
      return NextResponse.json({ error: 'Kelas deteksi tidak valid atau nonaktif.' }, { status: 400 });
    }

    if (mediaAssetId) {
      const media = await prisma.mediaAsset.findFirst({ where: { id: String(mediaAssetId), sessionId: id } });
      if (!media) return NextResponse.json({ error: 'Media tidak ada pada sesi ini.' }, { status: 400 });
    }

    let bboxJson: string | null = null;
    if (bbox !== undefined && bbox !== null) {
      const ok =
        typeof bbox === 'object' &&
        ['x', 'y', 'width', 'height'].every((k) => typeof (bbox as any)[k] === 'number' && (bbox as any)[k] >= 0 && (bbox as any)[k] <= 1);
      if (!ok) return NextResponse.json({ error: 'bbox harus berisi x, y, width, height bernilai 0-1.' }, { status: 400 });
      bboxJson = JSON.stringify(bbox);
    }
    if (timestampSeconds !== undefined && timestampSeconds !== null && !(typeof timestampSeconds === 'number' && timestampSeconds >= 0)) {
      return NextResponse.json({ error: 'timestampSeconds tidak valid.' }, { status: 400 });
    }

    const correction = await prisma.$transaction(async (tx) => {
      const c = await tx.officerCorrection.create({
        data: {
          kind: 'terlewat',
          sessionId: id,
          mediaAssetId: mediaAssetId ? String(mediaAssetId) : null,
          classId: cls.id,
          bbox: bboxJson,
          timestampSeconds: typeof timestampSeconds === 'number' ? timestampSeconds : null,
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          actorId: user.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'OFFICER_TERLEWAT',
          entityType: 'SurveySession',
          entityId: id,
          actorId: user.userId,
          changes: JSON.stringify({
            correctionId: c.id,
            classId: cls.id,
            className: cls.name,
            actionDescription: `Petugas menandai temuan "${cls.displayName}" yang terlewat oleh model.`,
          }),
        },
      });
      return c;
    });

    return NextResponse.json({ success: true, correction }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Missed finding error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan temuan terlewat.' }, { status: 500 });
  }
}
