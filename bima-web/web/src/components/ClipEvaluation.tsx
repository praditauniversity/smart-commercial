'use client';

import React from 'react';
import { CheckCircle2, CircleDashed, Info } from 'lucide-react';
import { parseList, type EvaluatedClipView } from '@/lib/media-view';

/** Label wajib per video: pengelola yang menilai harus tahu mana keluaran berbukti empiris dan mana yang baru demonstrasi. */
export function ClipEvaluationBadge({ clip, note }: { clip: EvaluatedClipView | null | undefined; note?: string | null }) {
  if (clip) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Data uji — dievaluasi (skor BLEU &amp; LLM-based tersedia)
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        <CircleDashed className="h-3.5 w-3.5" />
        Video baru — belum dievaluasi
      </span>
      {note && <span className="max-w-md text-[11px] text-amber-700">{note}</span>}
    </span>
  );
}

const fmt = (v: number | null, digits: number) => (v === null || v === undefined ? '-' : v.toFixed(digits));

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{i}</span>
      ))}
    </span>
  );
}

/**
 * Teks naratif (video-to-text). Untuk klip terevaluasi: teks model + skor riil. Untuk video lain: field ditandai
 * eksplisit "Belum dievaluasi" — tidak dikosongkan diam-diam dan tidak diisi teks rekaan.
 */
export function NarrativePanel({ clip, note }: { clip: EvaluatedClipView | null | undefined; note?: string | null }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Deskripsi naratif">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Deskripsi naratif (video-to-text)</h3>
        <ClipEvaluationBadge clip={clip} note={note} />
      </div>

      {!clip ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-900">
          <p className="font-bold">Belum dievaluasi</p>
          <p className="mt-1 text-xs text-amber-800">
            Deskripsi naratif belum tersedia untuk video ini. Model video-to-text hanya dievaluasi pada 35 klip uji;
            tidak ada teks yang dibuat untuk video baru. Deteksi objek (kotak pembatas) tetap dijalankan dan
            ditampilkan pada galeri frame di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Teks model {clip.generatorModel ? `(${clip.generatorModel}, zero-shot)` : ''}
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{clip.modelCaption}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['BLEU', fmt(clip.bleu, 4)],
              ['Skor LLM-based', clip.llmOverall === null ? '-' : `${fmt(clip.llmOverall, 0)}/100`],
              ['Kelengkapan deteksi', fmt(clip.completeness, 3)],
              ['Akurasi lokasi', clip.locationAccuracy === null ? '-' : `${fmt(clip.locationAccuracy, 0)}/5`],
              ['Akurasi keparahan', clip.severityAccuracy === null ? '-' : `${fmt(clip.severityAccuracy, 0)}/5`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</div>
                <div className="font-mono text-sm font-bold text-slate-900">{v}</div>
              </div>
            ))}
          </div>

          <dl className="grid gap-2 text-xs sm:grid-cols-3">
            <div><dt className="mb-0.5 font-semibold text-slate-600">Kategori terdeteksi</dt><dd><Chips items={parseList(clip.categoriesDetected)} tone="bg-emerald-100 text-emerald-800" /></dd></div>
            <div><dt className="mb-0.5 font-semibold text-slate-600">Tidak terdeteksi</dt><dd><Chips items={parseList(clip.categoriesMissed)} tone="bg-rose-100 text-rose-800" /></dd></div>
            <div><dt className="mb-0.5 font-semibold text-slate-600">Halusinasi</dt><dd><Chips items={parseList(clip.categoriesHallucinated)} tone="bg-orange-100 text-orange-800" /></dd></div>
          </dl>

          <details className="rounded-lg border border-slate-200 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">Caption acuan (ground truth) dan alasan penilai</summary>
            <p className="mt-2 whitespace-pre-line text-slate-700"><span className="font-semibold">Acuan: </span>{clip.referenceCaption}</p>
            {clip.judgeReason && <p className="mt-2 text-slate-700"><span className="font-semibold">Alasan penilai: </span>{clip.judgeReason}</p>}
          </details>

          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Seluruh angka di atas adalah hasil evaluasi riil RQ3 untuk klip ini, bukan estimasi.
          </p>
        </div>
      )}
    </section>
  );
}
