'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import { Printer } from 'lucide-react';

/**
 * Lembar Validasi Ahli (instrumen KOSONG untuk dicetak/dibawa ke sesi dengan pengelola township).
 * Halaman ini tidak menyimpan jawaban apa pun, dan tidak ada jawaban yang dihasilkan sistem: penilaian ahli harus
 * dilakukan oleh ahli nyata. Butir di bawah adalah DRAF dan wajib disesuaikan dengan Tabel 3.30 naskah tesis.
 */
const ASPECTS: { title: string; items: string[] }[] = [
  {
    title: 'A. Kesesuaian rancangan sistem',
    items: [
      'Alur sistem (unggah media → deteksi → skor risiko → peninjauan petugas) sesuai dengan proses inspeksi di kawasan.',
      'Pengelompokan Keselamatan Infrastruktur dan Monitoring Kepatuhan sesuai dengan kebutuhan pengelola.',
      'Peran admin, surveyor, dan supervisor/manajer sesuai dengan pembagian kerja yang berlaku.',
      'Jalur koreksi petugas (keliru, terlewat, ubah kelas/severity) memadai untuk menjaga mutu hasil.',
    ],
  },
  {
    title: 'B. Ketepatan keluaran',
    items: [
      'Objek yang dikenali sistem (kotak pembatas dan kelasnya) sesuai dengan kondisi di lapangan.',
      'Skor risiko (Severity × Exposure) dan pita prioritas mencerminkan tingkat kepentingan penanganan.',
      'Deskripsi naratif pada klip yang sudah dievaluasi sesuai dengan kondisi yang terlihat pada video.',
      'Tampilan yang membedakan data uji (dievaluasi) dan video baru (belum dievaluasi) jelas dan tidak menyesatkan.',
    ],
  },
  {
    title: 'C. Kelayakan rekomendasi',
    items: [
      'Urutan prioritas lokasi pada dasbor layak dijadikan dasar penjadwalan pemeliharaan.',
      'Informasi pada dasbor cukup untuk mengambil keputusan tindak lanjut tanpa membuka data mentah.',
      'Sistem layak dipertimbangkan untuk dikembangkan lebih lanjut pada skala kawasan sebenarnya.',
    ],
  },
];

const DISCLOSURES = [
  'Deteksi objek memakai model YOLO11n/YOLO26n per kategori (mAP@0,50 berkisar 0,2149 pada vegetasi hingga 0,9720 pada rambu). Kategori vegetasi dan rambu memiliki kinerja deteksi yang lebih rendah/terbatas; hasilnya perlu ditinjau petugas.',
  'Rambu: model hanya mendeteksi keberadaan rambu. Kondisi normal/rusak belum diklasifikasi, sehingga Severity rambu adalah nilai awal 2 (Sedang) yang dapat diubah petugas.',
  'Tingkat Paparan (Exposure) pada purwarupa berasal dari ZONA CONTOH (data simulasi), bukan data lokasi riil. Skor risiko yang tampil adalah demonstrasi mekanisme, bukan penilaian lokasi sebenarnya.',
  'Deskripsi naratif hanya tersedia untuk 35 klip uji yang telah dievaluasi (skor BLEU rata-rata 0,0179; skor LLM-based rata-rata 74,57/100). Untuk video baru, sistem menampilkan “Belum dievaluasi”; tidak ada teks yang dibuat.',
  'Jumlah pada dasbor adalah jumlah kotak deteksi pada frame sampel (≤24 frame per klip), bukan jumlah objek unik. Skor lokasi memakai deteksi terburuk.',
  'Waktu proses diukur pada mesin pengembangan, belum pada perangkat produksi.',
];

const SCENARIO = [
  'Dasbor supervisor: urutan lokasi menurut skor risiko, filter pita/status/surveyor.',
  'Detail sesi: galeri frame dengan kotak deteksi, ambang confidence, lencana “Data uji — dievaluasi”.',
  'Detail sesi video baru: lencana “Video baru — belum dievaluasi”.',
  'Koreksi: konfirmasi, tandai keliru, ubah kelas, ubah severity, tandai terlewat.',
  'Dasbor surveyor (hanya data sendiri) dan dasbor admin (seluruh data + hasil koreksi + latensi).',
];

const box = 'inline-block h-5 w-5 rounded border border-slate-400 align-middle';

export default function ValidasiAhliPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 print:bg-white print:pb-0 sm:pb-16">
      <div className="print:hidden"><Navbar /></div>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 print:max-w-none print:space-y-4 print:px-0 print:py-0 sm:px-6">
        <div className="flex items-start gap-3 print:hidden">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Instrumen Validasi Ahli</h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">Lembar kosong untuk dibawa ke sesi bersama pengelola township. Tidak ada jawaban yang disimpan atau diisi oleh sistem.</p>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Printer className="h-4 w-4" />Cetak lembar</button>
        </div>

        <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 print:border-slate-400 print:bg-white">
          <b>DRAF.</b> Butir penilaian di bawah adalah contoh kerangka (kesesuaian rancangan sistem, ketepatan keluaran, kelayakan rekomendasi). Sesuaikan butir, skala, dan bobot dengan <b>Tabel 3.30</b> naskah tesis sebelum dipakai. Penilaian harus diisi oleh ahli yang menilai langsung; hasilnya tidak boleh diisi atau disimulasikan.
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-slate-400" aria-label="Identitas">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Identitas ahli</h2>
          <dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2">
            {['Nama', 'Jabatan', 'Institusi / pengelola kawasan', 'Pengalaman pengelolaan kawasan (tahun)', 'Tanggal sesi', 'Tanda tangan'].map((l) => (
              <div key={l}><dt className="font-semibold text-slate-600">{l}</dt><dd className="mt-5 border-b border-slate-400" /></div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-slate-400" aria-label="Hal yang perlu diketahui ahli">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Keterbatasan purwarupa yang perlu diketahui sebelum menilai</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-700">{DISCLOSURES.map((d) => <li key={d}>{d}</li>)}</ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-slate-400" aria-label="Skenario peragaan">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Skenario peragaan (centang setelah diperagakan)</h2>
          <ul className="space-y-1.5 text-xs text-slate-700">{SCENARIO.map((s) => <li key={s} className="flex items-start gap-2"><span className={box} />{s}</li>)}</ul>
        </section>

        {ASPECTS.map((a) => (
          <section key={a.title} className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-slate-400" aria-label={a.title}>
            <h2 className="mb-2 text-sm font-bold text-slate-900">{a.title}</h2>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="w-8 py-1.5">No</th><th className="py-1.5">Butir (draf)</th><th className="w-44 py-1.5 text-center">Skor (skala sesuai Tabel 3.30)</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {a.items.map((it, i) => (
                  <tr key={it}><td className="py-2 align-top font-mono">{i + 1}</td><td className="py-2 pr-3 align-top">{it}</td><td className="py-2 text-center align-top"><span className="mx-auto inline-block h-6 w-24 rounded border border-slate-400" /></td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-xs font-semibold text-slate-600">Catatan / saran untuk aspek ini<div className="mt-6 border-b border-slate-400" /><div className="mt-6 border-b border-slate-400" /></div>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-slate-400" aria-label="Kesimpulan">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Kesimpulan umum ahli</h2>
          <div className="mt-6 border-b border-slate-400" /><div className="mt-6 border-b border-slate-400" /><div className="mt-6 border-b border-slate-400" />
        </section>
      </main>
    </div>
  );
}
