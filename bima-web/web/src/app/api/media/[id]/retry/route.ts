import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
      include: { session: true },
    });

    if (!mediaAsset) {
      return NextResponse.json({ error: 'Media asset tidak ditemukan.' }, { status: 404 });
    }

    if (user.role === 'surveyor' && mediaAsset.session.surveyorId !== user.userId) {
      return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    if (!['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'].includes(mediaAsset.session.status)) {
      return NextResponse.json(
        { error: 'Retry hanya dapat dilakukan pada sesi aktif atau revisi.' },
        { status: 400 }
      );
    }

    // Forward to process endpoint
    const url = new URL(request.url);
    const processUrl = `${url.origin}/api/media/${id}/process`;

    const cookieHeader = request.headers.get('cookie') || '';
    const res = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Retry media error:', error);
    return NextResponse.json({ error: 'Gagal melakukan retry processing media.' }, { status: 500 });
  }
}
