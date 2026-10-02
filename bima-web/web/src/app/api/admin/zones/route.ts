import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateZone } from '@/lib/master-validation';

export async function GET() {
  try {
    await requireAuth(['admin']);
    const zones = await prisma.zone.findMany({ orderBy: [{ exposure: 'desc' }, { name: 'asc' }], include: { _count: { select: { sessions: true } } } });
    return NextResponse.json({ success: true, zones });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('List zones (admin) error:', error);
    return NextResponse.json({ error: 'Gagal mengambil zona.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['admin']);
    const body = await request.json();
    const errors = validateZone(body);
    if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    if (await prisma.zone.findUnique({ where: { code: body.code } })) {
      return NextResponse.json({ error: `Kode zona "${body.code}" sudah dipakai.` }, { status: 409 });
    }
    const zone = await prisma.zone.create({
      data: {
        code: body.code,
        name: body.name.trim(),
        zoneType: body.zoneType,
        exposure: body.exposure,
        description: body.description?.trim() || null,
        // Zona baru dari UI dianggap data riil kecuali admin menandainya contoh.
        isSimulated: body.isSimulated === undefined ? false : Boolean(body.isSimulated),
      },
    });
    await prisma.auditLog.create({
      data: { action: 'ADMIN_CREATE_ZONE', entityType: 'Zone', entityId: zone.id, actorId: user.userId, changes: JSON.stringify({ code: zone.code, name: zone.name, exposure: zone.exposure, isSimulated: zone.isSimulated }) },
    });
    return NextResponse.json({ success: true, zone }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Create zone error:', error);
    return NextResponse.json({ error: 'Gagal membuat zona.' }, { status: 500 });
  }
}
