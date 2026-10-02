import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateZone } from '@/lib/master-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const body = await request.json();
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) return NextResponse.json({ error: 'Zona tidak ditemukan.' }, { status: 404 });
    const errors = validateZone(body, { partial: true });
    if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    if (body.code !== undefined && body.code !== zone.code && (await prisma.zone.findUnique({ where: { code: body.code } }))) {
      return NextResponse.json({ error: `Kode zona "${body.code}" sudah dipakai.` }, { status: 409 });
    }
    const data: Record<string, unknown> = {};
    for (const k of ['code', 'zoneType', 'exposure'] as const) if (body[k] !== undefined) data[k] = body[k];
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.isSimulated !== undefined) data.isSimulated = Boolean(body.isSimulated);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    const updated = await prisma.zone.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_UPDATE_ZONE', entityType: 'Zone', entityId: id, actorId: user.userId,
        changes: JSON.stringify({ previous: { name: zone.name, exposure: zone.exposure, isActive: zone.isActive, isSimulated: zone.isSimulated }, next: data, note: 'Exposure baru berlaku untuk deteksi berikutnya; temuan lama tidak dihitung ulang.' }),
      },
    });
    return NextResponse.json({ success: true, zone: updated });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Update zone error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui zona.' }, { status: 500 });
  }
}

/** Zona yang sudah dipakai sesi hanya dinonaktifkan (riwayat tetap utuh); zona tak terpakai dihapus. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const zone = await prisma.zone.findUnique({ where: { id }, include: { _count: { select: { sessions: true } } } });
    if (!zone) return NextResponse.json({ error: 'Zona tidak ditemukan.' }, { status: 404 });
    const inUse = zone._count.sessions > 0;
    if (inUse) await prisma.zone.update({ where: { id }, data: { isActive: false } });
    else await prisma.zone.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { action: inUse ? 'ADMIN_DEACTIVATE_ZONE' : 'ADMIN_DELETE_ZONE', entityType: 'Zone', entityId: id, actorId: user.userId, changes: JSON.stringify({ code: zone.code, name: zone.name, sessions: zone._count.sessions }) },
    });
    return NextResponse.json({ success: true, deactivated: inUse });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Delete zone error:', error);
    return NextResponse.json({ error: 'Gagal menghapus zona.' }, { status: 500 });
  }
}
