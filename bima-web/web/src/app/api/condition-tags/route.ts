import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/** Tag subtipe kerusakan aktif (Tahap 2) untuk dipilih supervisor; dapat dibaca semua peran yang login. */
export async function GET() {
  try {
    await requireAuth();
    const tags = await prisma.conditionTag.findMany({
      where: { isActive: true, classDefinition: { hasConditionStage: true, isActive: true } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, classId: true, code: true, label: true, severity: true },
    });
    return NextResponse.json({ success: true, tags });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('List condition tags error:', error);
    return NextResponse.json({ error: 'Gagal mengambil daftar tag.' }, { status: 500 });
  }
}
