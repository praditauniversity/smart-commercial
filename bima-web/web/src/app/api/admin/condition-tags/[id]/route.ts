import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateConditionTag } from '@/lib/master-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const body = await request.json();
    const tag = await prisma.conditionTag.findUnique({ where: { id } });
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan.' }, { status: 404 });
    const errors = validateConditionTag(body, { partial: true });
    if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    if (body.code !== undefined && body.code !== tag.code && (await prisma.conditionTag.findUnique({ where: { classId_code: { classId: tag.classId, code: body.code } } }))) {
      return NextResponse.json({ error: `Kode tag "${body.code}" sudah dipakai.` }, { status: 409 });
    }
    const data: Record<string, unknown> = {};
    if (body.code !== undefined) data.code = body.code;
    if (body.label !== undefined) data.label = String(body.label).trim();
    if (body.severity !== undefined) data.severity = body.severity;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;
    const updated = await prisma.conditionTag.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_UPDATE_CONDITION_TAG', entityType: 'ConditionTag', entityId: id, actorId: user.userId,
        changes: JSON.stringify({ previous: { code: tag.code, label: tag.label, severity: tag.severity, isActive: tag.isActive }, next: data, note: 'Severity baru berlaku untuk penetapan tag berikutnya; temuan yang sudah memakai tag ini menyimpan severity-nya sendiri.' }),
      },
    });
    return NextResponse.json({ success: true, tag: updated });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Update condition tag error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui tag.' }, { status: 500 });
  }
}

/** Tag yang sudah dipakai temuan hanya dinonaktifkan (riwayat tetap utuh); tag yang belum dipakai dihapus. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['admin']);
    const { id } = await params;
    const tag = await prisma.conditionTag.findUnique({ where: { id }, include: { _count: { select: { detections: true } } } });
    if (!tag) return NextResponse.json({ error: 'Tag tidak ditemukan.' }, { status: 404 });
    const inUse = tag._count.detections > 0;
    if (inUse) await prisma.conditionTag.update({ where: { id }, data: { isActive: false } });
    else await prisma.conditionTag.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { action: inUse ? 'ADMIN_DEACTIVATE_CONDITION_TAG' : 'ADMIN_DELETE_CONDITION_TAG', entityType: 'ConditionTag', entityId: id, actorId: user.userId, changes: JSON.stringify({ code: tag.code, label: tag.label, detections: tag._count.detections }) },
    });
    return NextResponse.json({ success: true, deactivated: inUse });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Delete condition tag error:', error);
    return NextResponse.json({ error: 'Gagal menghapus tag.' }, { status: 500 });
  }
}
