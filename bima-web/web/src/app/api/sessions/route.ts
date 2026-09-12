import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = {};
    if (user.role === 'surveyor') {
      where.surveyorId = user.userId;
    }
    if (status) {
      where.status = status;
    }

    const sessions = await prisma.surveySession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        surveyor: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            mediaAssets: { where: { status: { not: 'deleted' } } },
            detections: { where: { isDeleted: false } },
            submissions: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, sessions });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('List sessions error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data sesi survei.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(['surveyor', 'admin']);
    const body = await request.json();

    const { name, locationType, locationGeojson, locationAddress, surveyDate } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Nama survei wajib diisi.' }, { status: 400 });
    }

    const session = await prisma.surveySession.create({
      data: {
        name: name.trim(),
        locationType: locationType || 'point',
        locationGeojson: typeof locationGeojson === 'string' ? locationGeojson : JSON.stringify(locationGeojson || {}),
        locationAddress: locationAddress || null,
        surveyDate: surveyDate ? new Date(surveyDate) : new Date(),
        startedAt: new Date(),
        status: 'berlangsung',
        surveyorId: user.userId,
      },
      include: {
        surveyor: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create session error:', error);
    return NextResponse.json({ error: 'Gagal membuat sesi survei baru.' }, { status: 500 });
  }
}
