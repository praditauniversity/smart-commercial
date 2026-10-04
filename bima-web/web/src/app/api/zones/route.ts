import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

/** Daftar zona aktif beserta Tingkat Paparan; dapat dibaca semua peran yang login. `isSimulated` = data contoh. */
export async function GET() {
  try {
    await requireAuth();
    const zones = await prisma.zone.findMany({
      where: { isActive: true },
      orderBy: [{ exposure: 'desc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, zoneType: true, exposure: true, description: true, isSimulated: true },
    });
    return NextResponse.json({ success: true, zones });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('List zones error:', error);
    return NextResponse.json({ error: 'Gagal mengambil daftar zona.' }, { status: 500 });
  }
}
