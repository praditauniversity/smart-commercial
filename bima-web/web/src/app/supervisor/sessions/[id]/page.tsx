'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MapPin, Video } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FrameGallery from '@/components/FrameGallery';
import { ClipEvaluationBadge, NarrativePanel } from '@/components/ClipEvaluation';
import { ComplianceBadge, RiskBadge, SimulatedTag } from '@/components/RiskBadge';
import CorrectionsLog from '@/components/CorrectionsLog';
import { useToast } from '@/components/ToastProvider';
import { EXPOSURE_LABEL, SEVERITY_LABEL, type Exposure, type Severity } from '@/lib/risk';
import type { DetectionView, EvaluatedClipView, FrameView } from '@/lib/media-view';

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
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetch(`/api/sessions/${id}`), fetch('/api/admin/classes')]);
      const sj = await s.json();
      if (!s.ok) throw new Error(sj.error || 'Gagal memuat sesi.');
      setSession(sj.session);
      const cj = await c.json();
      setClasses((cj.classes || []).filter((x: ClassOption) => x.categoryGroup));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => session?.detections.find((d) => d.id === selectedId) ?? null, [session, selectedId]);

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
              {session.zone?.isSimulated && <SimulatedTag />}
            </span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
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
                    <FrameGallery frames={m.frames} detections={dets} selectedDetectionId={selectedId} onSelectDetection={(d) => setSelectedId(d.id)} />
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

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Panel koreksi">
              <h2 className="mb-2 text-sm font-bold text-slate-900">Koreksi temuan</h2>
              {!selected ? (
                <p className="text-xs text-slate-500">Pilih sebuah kotak atau baris temuan pada galeri untuk meninjau dan mengoreksinya.</p>
              ) : (
                <CorrectionForm key={selected.id} detection={selected} classes={classes} busy={busy} onSubmit={correct} />
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

function CorrectionForm({ detection: d, classes, busy, onSubmit }: { detection: DetectionView; classes: ClassOption[]; busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState('');
  const [classId, setClassId] = useState('');
  const [severity, setSeverity] = useState<string>(d.severity ? String(d.severity) : '2');
  const infra = d.classDefinition?.categoryGroup === 'keselamatan_infrastruktur';
  const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50';
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-lg bg-slate-50 p-2.5">
        <div className="font-bold text-slate-900">{d.classDefinition?.displayName ?? d.className}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {infra ? <RiskBadge score={d.riskScore} band={d.priorityBand} severity={d.severity} exposure={d.exposure} /> : <ComplianceBadge />}
          <span className="font-mono text-slate-500">conf {d.confidence?.toFixed(2) ?? '-'}</span>
          <span className="text-slate-500">status: {d.reviewStatus.replace('_', ' ')}</span>
        </div>
        {infra && d.severity && <div className="mt-1 text-slate-600">Severity {SEVERITY_LABEL[d.severity as Severity]} ({d.severity}){d.severitySource === 'petugas' ? ' — dari petugas' : ' — bawaan kelas'}</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => onSubmit({ kind: 'dikonfirmasi' })}>Konfirmasi benar</button>
      </div>

      <label className="block">
        <span className="mb-1 block font-semibold text-slate-700">Alasan (wajib untuk “keliru”)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 p-2" />
      </label>
      <button type="button" disabled={busy || reason.trim() === ''} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={() => onSubmit({ kind: 'keliru', reason })}>Tandai keliru (false positive)</button>

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

      {infra && (
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
