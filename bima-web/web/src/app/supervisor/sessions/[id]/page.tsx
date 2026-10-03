'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MapPin, Video } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FrameGallery from '@/components/FrameGallery';
import { ClipEvaluationBadge, NarrativePanel } from '@/components/ClipEvaluation';
import { ComplianceBadge, ConditionBadge, RiskBadge } from '@/components/RiskBadge';
import CorrectionsLog from '@/components/CorrectionsLog';
import { useToast } from '@/components/ToastProvider';
import { CONDITION_MODEL_LABEL, EXPOSURE_LABEL, SEVERITY_LABEL, type Exposure, type Severity } from '@/lib/risk';
import type { DetectionView, EvaluatedClipView, FrameView } from '@/lib/media-view';

interface ConditionTagOption { id: string; classId: string; code: string; label: string; severity: number }
interface ClassOption { id: string; name: string; displayName: string; category: string | null; categoryGroup: string | null }
interface MediaView {
  id: string; fileName: string; fileType: string; fileUrl: string; status: string; durationSeconds: number | null;
  clipMatchNote: string | null; evaluatedClip: EvaluatedClipView | null; frames: FrameView[]; processingMetrics: string | null;
}
interface SessionView {
  id: string; name: string; status: string; locationAddress: string | null;
  surveyor: { name: string; email: string };
  zone: { name: string; exposure: number; isSimulated: boolean } | null;
  mediaAssets: MediaView[];
  detections: DetectionView[];
}

export default function SupervisorSessionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [session, setSession] = useState<SessionView | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [tags, setTags] = useState<ConditionTagOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c, t] = await Promise.all([fetch(`/api/sessions/${id}`), fetch('/api/admin/classes'), fetch('/api/condition-tags')]);
      const sj = await s.json();
      if (!s.ok) throw new Error(sj.error || 'Gagal memuat sesi.');
      setSession(sj.session);
      const cj = await c.json();
      setClasses((cj.classes || []).filter((x: ClassOption) => x.categoryGroup));
      setTags(((await t.json()).tags || []) as ConditionTagOption[]);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Koreksi rinci hanya saat tepat satu temuan dipilih; beberapa temuan dikoreksi massal lewat panel temuan.
  const selected = useMemo(() => (selectedIds.length === 1 ? session?.detections.find((d) => d.id === selectedIds[0]) ?? null : null), [session, selectedIds]);

  async function correct(body: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/detections/${selected.id}/correct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan koreksi.');
      toast.success?.('Koreksi tersimpan.');
      await load();
      setLogKey((k) => k + 1);
    } catch (e: any) {
      toast.error?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkCorrect(ids: string[], kind: 'dikonfirmasi' | 'keliru', reason: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/detections/bulk-correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, kind, reason }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan koreksi massal.');
      toast.success?.(`${j.updated} temuan ${kind === 'keliru' ? 'ditandai keliru' : 'dikonfirmasi benar'}.`);
      await load();
      setLogKey((k) => k + 1);
      return true;
    } catch (e: any) {
      toast.error?.(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="min-h-screen bg-slate-50"><Navbar /><p role="alert" className="mx-auto mt-10 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p></div>;
  if (!session) return <div className="min-h-screen bg-slate-50"><Navbar /><p className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat sesi…</p></div>;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/supervisor/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke dashboard</Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-4">
          <h1 className="text-xl font-bold text-slate-900">{session.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>Surveyor: <b>{session.surveyor.name}</b></span>
            <span>Status: <b>{session.status.replace(/_/g, ' ')}</b></span>
            {session.locationAddress && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{session.locationAddress}</span>}
            <span className="inline-flex items-center gap-1.5">
              Zona: {session.zone ? <b>{session.zone.name} · Exposure {EXPOSURE_LABEL[session.zone.exposure as Exposure]} ({session.zone.exposure})</b> : <b className="text-amber-700">belum ada zona — temuan belum dapat diberi skor</b>}
            </span>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {session.mediaAssets.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Sesi ini belum memiliki media.</p>}
            {session.mediaAssets.map((m) => {
              const dets = session.detections.filter((d) => d.mediaAssetId === m.id);
              return (
                <article key={m.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label={m.fileName}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Video className="h-4 w-4 text-slate-500" />
                    <h2 className="mr-auto break-all text-sm font-bold text-slate-900">{m.fileName}</h2>
                    {m.fileType === 'video' && <ClipEvaluationBadge clip={m.evaluatedClip} note={m.clipMatchNote} />}
                  </div>
                  {m.status !== 'completed' ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Status media: <b>{m.status}</b>. Deteksi belum selesai atau belum dijalankan.</p>
                  ) : (
                    <FrameGallery
                      frames={m.frames} detections={dets} mode="koreksi"
                      selectedIds={selectedIds.filter((sid) => dets.some((d) => d.id === sid))}
                      onSelectionChange={(ids) => setSelectedIds([...selectedIds.filter((sid) => !dets.some((d) => d.id === sid)), ...ids])}
                      onBulk={bulkCorrect} bulkBusy={busy}
                    />
                  )}
                  {m.fileType === 'video' && (
                    <div>
                      <button type="button" onClick={() => setPlaying(playing === m.id ? null : m.id)} className="text-xs font-semibold text-blue-700 hover:underline">
                        {playing === m.id ? 'Sembunyikan video' : 'Putar video (versi 720p, hanya untuk tampilan)'}
                      </button>
                      {playing === m.id && <video src={m.fileUrl} controls preload="metadata" className="mt-2 w-full rounded-lg bg-black" />}
                    </div>
                  )}
                  {m.fileType === 'video' ? <NarrativePanel clip={m.evaluatedClip} note={m.clipMatchNote} /> : <p className="text-[11px] text-slate-500">Deskripsi naratif hanya tersedia untuk video.</p>}
                </article>
              );
            })}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Panel koreksi">
              <h2 className="mb-2 text-sm font-bold text-slate-900">Koreksi temuan</h2>
              {selectedIds.length > 1 ? (
                <p className="text-xs text-slate-600"><b>{selectedIds.length} temuan dipilih.</b> Gunakan tombol “Konfirmasi benar” atau “Tandai keliru” pada panel temuan di samping gambar. Pilih satu temuan saja untuk koreksi rinci.</p>
              ) : !selected ? (
                <p className="text-xs text-slate-500">Pilih sebuah kotak atau baris temuan pada galeri untuk mengoreksinya. Centang beberapa temuan di panel untuk koreksi massal.</p>
              ) : (
                <CorrectionForm key={selected.id} detection={selected} classes={classes} tags={tags} busy={busy} onSubmit={correct} />
              )}
            </section>
            <MissedForm sessionId={session.id} media={session.mediaAssets} classes={classes} onSaved={() => { setLogKey((k) => k + 1); toast.success?.('Temuan terlewat dicatat.'); }} />
          </aside>
        </div>

        <CorrectionsLog sessionId={session.id} title="Riwayat koreksi pada sesi ini" refreshKey={logKey} />
      </main>
    </div>
  );
}

const SOURCE_TEXT: Record<string, string> = { bawaan: 'bawaan kelas', sementara: 'sementara (subtipe belum ditentukan)', tag: 'dari tag subtipe', petugas: 'dari petugas' };

function CorrectionForm({ detection: d, classes, tags, busy, onSubmit }: { detection: DetectionView; classes: ClassOption[]; tags: ConditionTagOption[]; busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState('');
  const [classId, setClassId] = useState('');
  const [severity, setSeverity] = useState<string>(d.severity ? String(d.severity) : '2');
  const infra = d.classDefinition?.categoryGroup === 'keselamatan_infrastruktur';
  // Tahap 2: hanya kelas dengan hasConditionStage (rambu) yang memiliki kondisi dan tag subtipe.
  const hasStage = Boolean(d.classDefinition?.hasConditionStage);
  const [cond, setCond] = useState<string>(d.conditionLabel === 'normal' || d.conditionLabel === 'damaged' ? d.conditionLabel : '');
  const [tagId, setTagId] = useState<string>(d.conditionTag?.id ?? '');
  const classTags = tags.filter((t) => t.classId === d.classDefinition?.id);
  const isNormalSign = hasStage && d.conditionLabel === 'normal';
  // Rambu yang sudah diklasifikasi Tahap 2: severity ditentukan kondisi + tag subtipe, bukan form terpisah.
  const stageDecides = hasStage && Boolean(d.conditionLabel);
  const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50';
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-lg bg-slate-50 p-2.5">
        <div className="font-bold text-slate-900">{d.classDefinition?.displayName ?? d.className}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {infra ? (isNormalSign ? null : <RiskBadge score={d.riskScore} band={d.priorityBand} severity={d.severity} exposure={d.exposure} source={d.severitySource} />) : <ComplianceBadge />}
          {hasStage && <ConditionBadge label={d.conditionLabel} tag={d.conditionTag} />}
          <span className="font-mono text-slate-500">conf {d.confidence?.toFixed(2) ?? '-'}</span>
          <span className="text-slate-500">status: {d.reviewStatus.replace('_', ' ')}</span>
        </div>
        {infra && d.severity && !isNormalSign && <div className="mt-1 text-slate-600">Severity {SEVERITY_LABEL[d.severity as Severity]} ({d.severity}) — {SOURCE_TEXT[d.severitySource] ?? d.severitySource}</div>}
        {hasStage && !d.conditionLabel && <div className="mt-1 text-amber-700">Kondisi rambu belum diklasifikasi (Tahap 2 tidak aktif saat deteksi).</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => onSubmit({ kind: 'dikonfirmasi' })}>Konfirmasi benar</button>
      </div>

      <label className="block">
        <span className="mb-1 block font-semibold text-slate-700">Alasan (opsional)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <button type="button" disabled={busy} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={() => onSubmit({ kind: 'keliru', reason })}>Tandai keliru (false positive)</button>

      <div className="border-t border-slate-100 pt-3">
        <span className="mb-1 block font-semibold text-slate-700">Kelas yang benar</span>
        <div className="flex gap-2">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Kelas yang benar" className="min-w-0 flex-1 rounded-lg border border-slate-300 p-1.5">
            <option value="">Pilih kelas…</option>
            {classes.filter((c) => c.id !== d.classDefinition?.id).map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
          <button type="button" disabled={busy || !classId} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} onClick={() => onSubmit({ kind: 'kelas_diubah', classId, reason })}>Ubah</button>
        </div>
      </div>

      {hasStage && (
        <div className="space-y-2 border-t border-slate-100 pt-3" role="group" aria-label="Kondisi rambu">
          <span className="block font-semibold text-slate-700">Kondisi rambu</span>
          <div className="flex gap-4">
            {[['normal', 'Normal'], ['damaged', 'Rusak']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5"><input type="radio" name="cond" value={v} checked={cond === v} onChange={() => { setCond(v); if (v === 'normal') setTagId(''); }} />{l}</label>
            ))}
          </div>
          {cond === 'damaged' && (
            <label className="block">
              <span className="mb-1 block text-slate-600">Subtipe kerusakan (tag)</span>
              <select value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label="Subtipe kerusakan" className="w-full rounded-lg border border-slate-300 p-1.5">
                <option value="">Subtipe belum ditentukan (severity sementara)</option>
                {classTags.map((t) => <option key={t.id} value={t.id}>{t.label} — severity {SEVERITY_LABEL[t.severity as Severity]} ({t.severity})</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={busy || !cond} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`} onClick={() => onSubmit({ kind: 'kondisi_diubah', condition: cond, tagId: cond === 'damaged' ? (tagId || null) : undefined, reason })}>Simpan kondisi</button>
          <p className="text-[11px] text-slate-500">Normal = tanpa skor risiko. Rusak tanpa subtipe = severity sementara; memilih tag mengganti severity sesuai master tag. Hasil awal: {CONDITION_MODEL_LABEL}.</p>
        </div>
      )}

      {infra && !stageDecides && (
        <div className="border-t border-slate-100 pt-3">
          <span className="mb-1 block font-semibold text-slate-700">Severity</span>
          <div className="flex gap-2">
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity" className="flex-1 rounded-lg border border-slate-300 p-1.5">
              {([1, 2, 3] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]} ({s})</option>)}
            </select>
            <button type="button" disabled={busy} className={`${btn} bg-amber-600 text-white hover:bg-amber-700`} onClick={() => onSubmit({ kind: 'severity_diubah', severity: Number(severity), reason })}>Ubah</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Skor dihitung ulang dari severity baru × exposure zona sesi.</p>
        </div>
      )}
    </div>
  );
}

function MissedForm({ sessionId, media, classes, onSaved }: { sessionId: string; media: MediaView[]; classes: ClassOption[]; onSaved: () => void }) {
  const [mediaId, setMediaId] = useState('');
  const [classId, setClassId] = useState('');
  const [ts, setTs] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/missed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, mediaAssetId: mediaId || undefined, timestampSeconds: ts === '' ? undefined : Number(ts), reason }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan.');
      setClassId(''); setTs(''); setReason('');
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs" aria-label="Tandai temuan terlewat">
      <h2 className="mb-1 text-sm font-bold text-slate-900">Tandai temuan terlewat</h2>
      <p className="mb-2 text-slate-500">Objek yang ada di lapangan tetapi tidak terdeteksi model (false negative).</p>
      <div className="space-y-2">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Kelas yang terlewat" className="w-full rounded-lg border border-slate-300 p-1.5">
          <option value="">Kelas yang terlewat…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
        <select value={mediaId} onChange={(e) => setMediaId(e.target.value)} aria-label="Media" className="w-full rounded-lg border border-slate-300 p-1.5">
          <option value="">Seluruh sesi (tanpa media tertentu)</option>
          {media.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
        </select>
        <input value={ts} onChange={(e) => setTs(e.target.value)} type="number" min={0} step="0.1" placeholder="Detik ke- (opsional)" aria-label="Detik" className="w-full rounded-lg border border-slate-300 p-1.5" />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Catatan (opsional)" className="w-full rounded-lg border border-slate-300 p-2" />
        {err && <p role="alert" className="text-rose-700">{err}</p>}
        <button type="button" onClick={submit} disabled={busy || !classId} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-900 disabled:opacity-50">Catat terlewat</button>
      </div>
    </section>
  );
}
