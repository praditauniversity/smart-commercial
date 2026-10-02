import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/** Riwayat koreksi petugas (supervisor/admin). Filter: sessionId, kind, actorId. */
export async function GET(request: Request) {
  try {
    await requireAuth(['supervisor', 'admin']);
    const sp = new URL(request.url).searchParams;
    const where: Record<string, unknown> = {};
    for (const key of ['sessionId', 'kind', 'actorId'] as const) {
      const v = sp.get(key);
      if (v) where[key] = v;
    }
    const take = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100', 10) || 100));

    const [rows, byKind] = await Promise.all([
      prisma.officerCorrection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          actor: { select: { id: true, name: true, role: true } },
          session: { select: { id: true, name: true } },
          detection: { select: { id: true, className: true, riskScore: true, priorityBand: true, confidence: true } },
          mediaAsset: { select: { id: true, fileName: true } },
        },
      }),
      prisma.officerCorrection.groupBy({ by: ['kind'], where, _count: { _all: true } }),
    ]);
    return NextResponse.json({
      success: true,
      corrections: rows,
      countsByKind: Object.fromEntries(byKind.map((g) => [g.kind, g._count._all])),
    });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('List corrections error:', error);
    return NextResponse.json({ error: 'Gagal mengambil riwayat koreksi.' }, { status: 500 });
  }
}
