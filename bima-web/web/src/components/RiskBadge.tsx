'use client';

import React from 'react';
import { BAND_LABEL, CONDITION_MODEL_LABEL, GROUP_LABEL, SEVERITY_LABEL, EXPOSURE_LABEL, type PriorityBand, type Severity, type Exposure } from '@/lib/risk';

export const BAND_STYLE: Record<PriorityBand, { chip: string; box: string; dot: string }> = {
  rendah: { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', box: 'border-emerald-500', dot: 'bg-emerald-500' },
  sedang: { chip: 'bg-amber-100 text-amber-800 border-amber-200', box: 'border-amber-500', dot: 'bg-amber-500' },
  tinggi: { chip: 'bg-orange-100 text-orange-800 border-orange-200', box: 'border-orange-500', dot: 'bg-orange-500' },
  kritikal: { chip: 'bg-rose-100 text-rose-800 border-rose-300', box: 'border-rose-600', dot: 'bg-rose-600' },
};

/** Warna kotak untuk temuan Monitoring Kepatuhan (tanpa skor risiko): sengaja netral agar tidak terbaca sebagai tingkat risiko. */
export const COMPLIANCE_STYLE = { chip: 'bg-slate-100 text-slate-700 border-slate-300', box: 'border-slate-500 border-dashed', dot: 'bg-slate-500' };

const SOURCE_NOTE: Record<string, string> = {
  sementara: 'severity sementara: subtipe belum ditentukan',
  tag: 'severity dari tag subtipe',
  petugas: 'severity diubah petugas',
};

export function RiskBadge({ score, band, severity, exposure, compact = false, source }: {
  score: number | null;
  band: PriorityBand | null;
  severity?: number | null;
  exposure?: number | null;
  compact?: boolean;
  /** Sumber Severity (bawaan | sementara | tag | petugas); ditampilkan sebagai tooltip bila bukan bawaan. */
  source?: string | null;
}) {
  if (!band || score === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500" title="Skor risiko belum dapat dihitung (mis. sesi belum memiliki zona)">
        Belum dinilai
      </span>
    );
  }
  const st = BAND_STYLE[band];
  const note = source && SOURCE_NOTE[source] ? ` — ${SOURCE_NOTE[source]}` : '';
  const detail = (severity && exposure
    ? `Severity ${SEVERITY_LABEL[severity as Severity]} (${severity}) × Exposure ${EXPOSURE_LABEL[exposure as Exposure]} (${exposure}) = ${score}`
    : `Skor ${score}`) + note;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.chip}`} title={detail}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
      {BAND_LABEL[band]}
      {!compact && <span className="font-mono font-semibold opacity-80">· {score}</span>}
    </span>
  );
}

/** Temuan Monitoring Kepatuhan: hanya status temuan, tanpa skor risiko. */
export function ComplianceBadge() {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${COMPLIANCE_STYLE.chip}`} title="Monitoring Kepatuhan: hanya dideteksi dan dilaporkan, tanpa skor risiko">
      <span className={`h-1.5 w-1.5 rounded-full ${COMPLIANCE_STYLE.dot}`} />
      Terdeteksi · tanpa skor
    </span>
  );
}

export function GroupLabel({ group }: { group: string | null | undefined }) {
  if (group === 'keselamatan_infrastruktur' || group === 'monitoring_kepatuhan') return <>{GROUP_LABEL[group]}</>;
  return <>Belum dikelompokkan</>;
}

/** Penanda data contoh: nilai Exposure berasal dari zona simulasi, bukan lokasi riil. */
export function SimulatedTag({ label = 'data contoh' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700" title="Nilai ini berasal dari data contoh/simulasi, bukan data lokasi riil">
      {label}
    </span>
  );
}

/**
 * Hasil Tahap 2 rambu. normal = tanpa skor risiko; rusak = skor dihitung, subtipe dari tag supervisor
 * (sebelum dipilih: "subtipe belum ditentukan" dengan severity sementara).
 */
export function ConditionBadge({ label, tag }: { label: string | null | undefined; tag?: { label: string } | null }) {
  if (label === 'normal') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800" title={`Kondisi normal: tidak masuk penilaian risiko (${CONDITION_MODEL_LABEL})`}>
        Normal · tanpa skor
      </span>
    );
  }
  if (label === 'damaged') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800" title={`Kondisi rusak (${CONDITION_MODEL_LABEL})`}>
        Rusak · {tag ? tag.label : 'subtipe belum ditentukan'}
      </span>
    );
  }
  return null;
}
