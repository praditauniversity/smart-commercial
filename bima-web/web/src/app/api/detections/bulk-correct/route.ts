import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { planCorrection } from '@/lib/corrections';
import { exposureForSession } from '@/lib/risk-persist';

const MAX_IDS = 200;
const BULK_KINDS = ['dikonfirmasi', 'keliru'] as const;
type BulkKind = (typeof BULK_KINDS)[number];

/**
 * Koreksi massal (supervisor/admin): konfirmasi benar atau tandai keliru untuk banyak temuan sekaligus.
 * Setiap temuan tetap mendapat satu baris OfficerCorrection + AuditLog sendiri (riwayat per temuan utuh);
 * seluruhnya dalam satu transaksi. Alasan opsional.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(['supervisor', 'admin']);
    const body = await request.json();
    const { ids, kind, reason } = body ?? {};

    if (!(BULK_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ error: 'Koreksi massal hanya untuk "dikonfirmasi" atau "keliru".' }, { status: 400 });
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== 'string')) {
      return NextResponse.json({ error: 'Pilih minimal satu temuan.' }, { status: 400 });
    }
    const unique = Array.from(new Set<string>(ids));
    if (unique.length > MAX_IDS) {
      return NextResponse.json({ error: `Maksimal ${MAX_IDS} temuan per permintaan.` }, { status: 400 });
    }
    const note = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

    const detections = await prisma.detection.findMany({
      where: { id: { in: unique }, isDeleted: false },
      include: { classDefinition: true, conditionTag: true },
    });
    if (detections.length !== unique.length) {
      return NextResponse.json({ error: 'Sebagian temuan tidak ditemukan atau sudah dihapus.' }, { status: 404 });
    }

    const exposureCache = new Map<string, number | null>();
    const ops: ReturnType<typeof prisma.detection.update | typeof prisma.officerCorrection.create | typeof prisma.auditLog.create>[] = [];
    for (const d of detections) {
      if (!exposureCache.has(d.sessionId)) exposureCache.set(d.sessionId, await exposureForSession(d.sessionId));
      const exposure = d.exposure ?? exposureCache.get(d.sessionId) ?? null;
      const plan = planCorrection(
        {
          classId: d.classId,
          classProfile: d.classDefinition,
          severity: d.severity,
          severitySource: d.severitySource,
          exposure,
          conditionLabel: d.conditionLabel,
          conditionTagId: d.conditionTagId,
          tagSeverity: d.conditionTag?.severity ?? null,
        },
        { kind: kind as BulkKind }
      );
      if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
      ops.push(
        prisma.detection.update({ where: { id: d.id }, data: { ...plan.update } }),
        prisma.officerCorrection.create({
          data: { kind, detectionId: d.id, sessionId: d.sessionId, mediaAssetId: d.mediaAssetId, reason: note, actorId: user.userId },
        }),
        prisma.auditLog.create({
          data: {
            action: `OFFICER_${String(kind).toUpperCase()}`,
            entityType: 'Detection',
            entityId: d.id,
            actorId: user.userId,
            changes: JSON.stringify({
              previous: { reviewStatus: d.reviewStatus, riskScore: d.riskScore, priorityBand: d.priorityBand },
              next: plan.update,
              reason: note,
              actionDescription: `Koreksi massal petugas (${kind}) pada temuan "${d.className}".`,
            }),
          },
        })
      );
    }
    await prisma.$transaction(ops as any);
    return NextResponse.json({ success: true, updated: detections.length });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Bulk correct error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan koreksi massal.' }, { status: 500 });
  }
}
