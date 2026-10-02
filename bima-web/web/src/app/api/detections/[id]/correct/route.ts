import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isDetectionCorrectionKind, planCorrection } from '@/lib/corrections';
import { exposureForSession } from '@/lib/risk-persist';

/**
 * Koreksi petugas atas satu temuan (supervisor/admin). Menyimpan satu baris OfficerCorrection (riwayat tidak
 * ditimpa) + AuditLog, lalu memperbarui temuan. Data surveyor tidak diubah lewat jalur lain.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['supervisor', 'admin']);
    const { id } = await params;
    const body = await request.json();
    const { kind, classId, severity, reason } = body ?? {};

    if (!isDetectionCorrectionKind(kind)) {
      return NextResponse.json({ error: 'Jenis koreksi tidak valid.' }, { status: 400 });
    }
    if (kind === 'keliru' && (typeof reason !== 'string' || reason.trim() === '')) {
      return NextResponse.json({ error: 'Alasan wajib diisi untuk temuan yang ditandai keliru.' }, { status: 400 });
    }

    const detection = await prisma.detection.findUnique({
      where: { id },
      include: { classDefinition: true },
    });
    if (!detection || detection.isDeleted) {
      return NextResponse.json({ error: 'Deteksi tidak ditemukan.' }, { status: 404 });
    }

    let newClass: { id: string; name: string; categoryGroup: string | null; defaultSeverity: number | null; versionId: string | null } | null = null;
    if (kind === 'kelas_diubah') {
      const cls = await prisma.classDefinition.findUnique({
        where: { id: String(classId ?? '') },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      if (!cls || !cls.isActive) {
        return NextResponse.json({ error: 'Kelas deteksi tidak valid atau nonaktif.' }, { status: 400 });
      }
      newClass = { id: cls.id, name: cls.name, categoryGroup: cls.categoryGroup, defaultSeverity: cls.defaultSeverity, versionId: cls.versions[0]?.id ?? null };
    }

    const exposure = detection.exposure ?? (await exposureForSession(detection.sessionId));
    const plan = planCorrection(
      {
        classId: detection.classId,
        classProfile: detection.classDefinition,
        severity: detection.severity,
        severitySource: detection.severitySource,
        exposure,
      },
      { kind, severity: typeof severity === 'number' ? severity : undefined, newClass: newClass ? { id: newClass.id, profile: newClass } : undefined }
    );
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

    const previous = {
      classId: detection.classId,
      className: detection.className,
      severity: detection.severity,
      severitySource: detection.severitySource,
      riskScore: detection.riskScore,
      priorityBand: detection.priorityBand,
      reviewStatus: detection.reviewStatus,
    };

    const data: Record<string, unknown> = { ...plan.update };
    if (newClass) {
      data.className = newClass.name;
      data.classVersionId = newClass.versionId;
    }

    const [updated] = await prisma.$transaction([
      prisma.detection.update({ where: { id }, data, include: { classDefinition: true } }),
      prisma.officerCorrection.create({
        data: {
          kind,
          detectionId: id,
          sessionId: detection.sessionId,
          mediaAssetId: detection.mediaAssetId,
          classId: newClass?.id ?? null,
          severity: kind === 'severity_diubah' ? plan.update.severity : null,
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          actorId: user.userId,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: `OFFICER_${kind.toUpperCase()}`,
          entityType: 'Detection',
          entityId: id,
          actorId: user.userId,
          changes: JSON.stringify({
            previous,
            next: plan.update,
            reason: typeof reason === 'string' ? reason.trim() : null,
            actionDescription: `Koreksi petugas (${kind}) pada temuan "${detection.className}".`,
          }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, detection: updated });
  } catch (error: any) {
    if (error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Correct detection error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan koreksi.' }, { status: 500 });
  }
}
