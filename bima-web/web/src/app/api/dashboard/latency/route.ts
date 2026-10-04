import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { mediaLatency, parseMetrics, summarizeLatency, TARGET_MS } from '@/lib/latency';

/** Latensi per modul dari MediaAsset.processingMetrics, untuk admin dan supervisor. */
export async function GET() {
  try {
    await requireAuth(['supervisor', 'admin']);
    const media = await prisma.mediaAsset.findMany({
      where: { processingMetrics: { not: null }, status: { not: 'deleted' } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { id: true, fileName: true, fileType: true, durationSeconds: true, status: true, processingMetrics: true, session: { select: { id: true, name: true } } },
    });
    const rows = media.map((m) => ({ ...m, processingMetrics: undefined, latency: mediaLatency(parseMetrics(m.processingMetrics)) }));
    return NextResponse.json({
      success: true,
      targetMs: TARGET_MS,
      summary: summarizeLatency(rows.map((r) => r.latency)),
      media: rows.slice(0, 50),
    });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Latency error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data latensi.' }, { status: 500 });
  }
}
