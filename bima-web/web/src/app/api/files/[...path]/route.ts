import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { localPathForUrl, storageBackend, LOCAL_URL_PREFIX } from '@/lib/media-storage';

/**
 * Menyajikan berkas media dari backend penyimpanan lokal (STORAGE_BACKEND=local) untuk semua peran yang
 * login. Mendukung header Range agar <video> dapat di-seek. Tidak aktif pada backend Supabase.
 */
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
};

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requireAuth();
    if (storageBackend() !== 'local') {
      return NextResponse.json({ error: 'Tidak ditemukan.' }, { status: 404 });
    }
    const { path: parts } = await params;
    const full = localPathForUrl(`${LOCAL_URL_PREFIX}${parts.map(encodeURIComponent).join('/')}`);
    if (!full) return NextResponse.json({ error: 'Tidak ditemukan.' }, { status: 404 });

    let size: number;
    try {
      size = (await fs.stat(full)).size;
    } catch {
      return NextResponse.json({ error: 'Tidak ditemukan.' }, { status: 404 });
    }
    const contentType = TYPES[full.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    const baseHeaders = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new Response(stream, { headers: { ...baseHeaders, 'Content-Length': String(size) } });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Serve file error:', error);
    return NextResponse.json({ error: 'Gagal membaca berkas.' }, { status: 500 });
  }
}
