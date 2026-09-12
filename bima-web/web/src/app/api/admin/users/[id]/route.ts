import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['admin']);
    const { id } = await params;
    const body = await request.json();

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.role !== undefined) updateData.role = body.role === 'admin' ? 'admin' : 'surveyor';
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
    if (body.password && body.password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(body.password.trim(), 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: id,
        actorId: admin.userId,
        changes: JSON.stringify({ previous: user, updated: updateData }),
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui user.' }, { status: 500 });
  }
}
