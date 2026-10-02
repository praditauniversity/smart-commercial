import prisma from '@/lib/prisma';
import { riskFields } from '@/lib/corrections';
import type { ClassRiskProfile } from '@/lib/risk';

/** Exposure sesi dari zonanya; null bila sesi belum memiliki zona. */
export async function exposureForSession(sessionId: string): Promise<number | null> {
  const s = await prisma.surveySession.findUnique({ where: { id: sessionId }, select: { zone: { select: { exposure: true } } } });
  return s?.zone?.exposure ?? null;
}

/** Field Detection yang harus diperbarui saat kelasnya diganti: Severity kembali ke bawaan kelas baru, skor dihitung ulang. */
export async function riskUpdateForClassChange(sessionId: string, profile: ClassRiskProfile) {
  const exposure = await exposureForSession(sessionId);
  return { ...riskFields(profile, exposure, null), severitySource: 'bawaan' as const };
}
