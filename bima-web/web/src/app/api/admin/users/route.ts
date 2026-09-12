import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    await requireAuth(['admin']);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { surveySessions: true, reviewedSubmissions: true } },
      },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data user.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuth(['admin']);
    const { email, name, password, role } = await request.json();

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'Email, nama, dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Email sudah terdaftar.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: name.trim(),
        passwordHash,
        role: role === 'admin' ? 'admin' : 'surveyor',
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: newUser.id,
        actorId: admin.userId,
        changes: JSON.stringify({ email: newUser.email, name: newUser.name, role: newUser.role }),
      },
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Gagal membuat user baru.' }, { status: 500 });
  }
}
