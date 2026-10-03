import { NextResponse } from 'next/server';
import { buildDemoAccounts, demoLoginEnabled } from '@/lib/demo-login';

// Dibaca saat permintaan (bukan saat build) karena bergantung pada env server.
export const dynamic = 'force-dynamic';

/**
 * Akun demo untuk tombol "Akses Cepat" di halaman login. Tanpa DEMO_LOGIN_ENABLED=true (atau pada mode production)
 * respons berisi daftar kosong dan TIDAK ada kata sandi yang dikirim.
 */
export async function GET() {
  const enabled = demoLoginEnabled(process.env);
  return NextResponse.json(
    { enabled, accounts: enabled ? buildDemoAccounts(process.env) : [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
