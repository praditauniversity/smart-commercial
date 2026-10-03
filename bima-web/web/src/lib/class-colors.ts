/**
 * Warna kotak pembatas per kelas objek (dipakai galeri frame). Satu warna tetap per kelas bawaan agar konsisten
 * di semua halaman; kelas baru buatan admin mendapat warna dari palet cadangan secara deterministik (hash nama).
 * Tingkat risiko tidak dikodekan lewat warna kotak, melainkan lewat lencana risiko pada panel.
 */
export const CLASS_COLORS: Record<string, string> = {
  pavedroad_pothole: '#dc2626', // merah
  pavedroad_crack: '#f59e0b', // kuning-oranye
  vegetation_blocking: '#15803d', // hijau tua
  vegetation_dead: '#92400e', // cokelat
  weeds: '#84cc16', // hijau limau
  sign: '#2563eb', // biru
  banner: '#9333ea', // ungu
  house_notice: '#db2777', // merah muda
};

const FALLBACK_PALETTE = ['#0891b2', '#4f46e5', '#be123c', '#475569', '#0f766e', '#a21caf'];

export function classColor(className: string): string {
  const fixed = CLASS_COLORS[className];
  if (fixed) return fixed;
  let h = 0;
  for (let i = 0; i < className.length; i++) h = (h * 31 + className.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

/** Warna teks (putih/hitam) yang terbaca di atas latar `hex` (luminansi relatif WCAG). */
export function readableTextColor(hex: string): '#ffffff' | '#111827' {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#111827' : '#ffffff';
}
