import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateConditionTag } from '@/lib/master-validation';

/** Master tag subtipe kerusakan (Tahap 2). Hanya admin yang mengelola. */
export async function GET() {
  try {
    await requireAuth(['admin']);
    const tags = await prisma.conditionTag.findMany({
      orderBy: [{ classId: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      include: { classDefinition: { select: { id: true, name: true, displayName: true } }, _count: { select: { detections: true } } },
    });
    return NextResponse.json({ success: true, tags });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('List condition tags (admin) error:', error);
    return NextResponse.json({ error: 'Gagal mengambil tag.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['admin']);
    const body = await request.json();
    const errors = validateConditionTag(body);
    if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });

    // Tag hanya untuk kelas dengan Tahap 2 (rambu). classId opsional: bawaan = satu-satunya kelas bertahap 2.
    const classes = await prisma.classDefinition.findMany({ where: { hasConditionStage: true, isActive: true } });
    const cls = body.classId ? classes.find((c) => c.id === body.classId) : classes.length === 1 ? classes[0] : undefined;
    if (!cls) return NextResponse.json({ error: 'Kelas tidak valid: tag hanya untuk kelas yang memiliki Tahap 2 (rambu).' }, { status: 400 });
    if (await prisma.conditionTag.findUnique({ where: { classId_code: { classId: cls.id, code: body.code } } })) {
      return NextResponse.json({ error: `Kode tag "${body.code}" sudah dipakai.` }, { status: 409 });
    }
    const last = await prisma.conditionTag.aggregate({ where: { classId: cls.id }, _max: { sortOrder: true } });
    const tag = await prisma.conditionTag.create({
      data: { classId: cls.id, code: body.code, label: String(body.label).trim(), severity: body.severity, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await prisma.auditLog.create({
      data: { action: 'ADMIN_CREATE_CONDITION_TAG', entityType: 'ConditionTag', entityId: tag.id, actorId: user.userId, changes: JSON.stringify({ code: tag.code, label: tag.label, severity: tag.severity, class: cls.name }) },
    });
    return NextResponse.json({ success: true, tag }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    console.error('Create condition tag error:', error);
    return NextResponse.json({ error: 'Gagal membuat tag.' }, { status: 500 });
  }
}
