'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/ToastProvider';
import { CONDITION_MODEL_LABEL, EXPOSURE_LABEL, GROUP_LABEL, SEVERITY_LABEL, type Exposure, type Severity } from '@/lib/risk';
import { ZONE_TYPES } from '@/lib/master-validation';

interface ClassRow { id: string; name: string; displayName: string; modelClass: string | null; category: string | null; categoryGroup: string | null; defaultSeverity: number | null; isActive: boolean; hasConditionStage?: boolean }
interface TagRow { id: string; code: string; label: string; severity: number; isActive: boolean; sortOrder: number; classDefinition: { displayName: string }; _count?: { detections: number } }
interface ZoneRow { id: string; code: string; name: string; zoneType: string; exposure: number; description: string | null; isSimulated: boolean; isActive: boolean; _count?: { sessions: number } }

const ZONE_TYPE_LABEL: Record<string, string> = { jalan_utama: 'Jalan umum ramai / akses utama', hunian: 'Kawasan hunian', area_minim_aktivitas: 'Area minim aktivitas' };
const field = 'rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-green/40';

export default function RiskMasterPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [tagDraft, setTagDraft] = useState({ code: '', label: '', severity: 2 });
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: '', name: '', zoneType: 'hunian', exposure: 2 });

  const load = useCallback(async () => {
    try {
      const [c, z, t] = await Promise.all([fetch('/api/admin/classes'), fetch('/api/admin/zones'), fetch('/api/admin/condition-tags')]);
      const cj = await c.json(), zj = await z.json(), tj = await t.json();
      if (!t.ok) throw new Error(tj.error);
      setTags(tj.tags);
      if (!c.ok) throw new Error(cj.error);
      if (!z.ok) throw new Error(zj.error);
      setClasses(cj.classes.filter((x: ClassRow) => x.modelClass));
      setZones(zj.zones);
    } catch (e: any) { setError(e.message || 'Gagal memuat data master.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(url: string, method: string, body?: unknown, okMsg = 'Tersimpan.') {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json();
    if (!res.ok) { toast.error(j.error || 'Gagal menyimpan.'); return false; }
    toast.success(okMsg);
    await load();
    return true;
  }

  const patchClass = (c: ClassRow, change: Partial<ClassRow>) => {
    const next = { ...c, ...change };
    // Pindah ke Monitoring Kepatuhan mengosongkan Severity; pindah ke Infrastruktur mengisi nilai awal 2 (dapat diubah).
    if (change.categoryGroup === 'monitoring_kepatuhan') next.defaultSeverity = null;
    if (change.categoryGroup === 'keselamatan_infrastruktur' && !next.defaultSeverity) next.defaultSeverity = 2;
    return send(`/api/admin/classes/${c.id}`, 'PATCH', { categoryGroup: next.categoryGroup, defaultSeverity: next.defaultSeverity }, 'Kelas diperbarui. Berlaku untuk deteksi berikutnya.');
  };

  if (error) return <div className="min-h-screen bg-dashboard-bg"><Navbar /><p role="alert" className="mx-auto mt-10 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p></div>;

  return (
    <div className="flex min-h-screen flex-col bg-dashboard-bg pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Data master risiko</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Severity per kelas dan Exposure per zona. Perubahan berlaku untuk deteksi berikutnya; temuan yang sudah ada tidak dihitung ulang otomatis.</p>
        </div>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label="Kelas dan Severity">
          <div className="border-b border-zinc-100 p-3"><h2 className="text-sm font-semibold text-zinc-900">Kelas model &amp; Severity bawaan</h2></div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm text-zinc-900">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white text-sm font-medium text-zinc-500"><tr><th className="px-3 py-3 font-medium">Kelas model</th><th className="px-3 py-3 font-medium">Kategori</th><th className="px-3 py-3 font-medium">Kelompok</th><th className="px-3 py-3 font-medium">Severity bawaan</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-3"><div className="font-medium text-zinc-900">{c.displayName}</div><div className="font-mono text-[10px] text-zinc-500">{c.modelClass}</div></td>
                    <td className="px-3 py-3">{c.category ?? '-'}</td>
                    <td className="px-3 py-3">
                      <select aria-label={`Kelompok ${c.displayName}`} className={field} value={c.categoryGroup ?? ''} onChange={(e) => patchClass(c, { categoryGroup: e.target.value || null })}>
                        <option value="">Belum dikelompokkan</option>
                        <option value="keselamatan_infrastruktur">{GROUP_LABEL.keselamatan_infrastruktur}</option>
                        <option value="monitoring_kepatuhan">{GROUP_LABEL.monitoring_kepatuhan}</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {c.categoryGroup === 'keselamatan_infrastruktur' ? (
                        <select aria-label={`Severity ${c.displayName}`} className={field} value={c.defaultSeverity ?? ''} onChange={(e) => patchClass(c, { defaultSeverity: Number(e.target.value) })}>
                          {([1, 2, 3] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]} ({s})</option>)}
                        </select>
                      ) : <span className="text-zinc-500">tanpa skor risiko</span>}
                      {c.hasConditionStage && <div className="mt-1 text-[10px] text-zinc-500">Severity sementara bagi rambu rusak; severity akhir mengikuti tag subtipe.</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label="Tag subtipe kerusakan rambu">
          <div className="border-b border-zinc-100 p-3">
            <h2 className="text-sm font-semibold text-zinc-900">Tag subtipe kerusakan rambu &amp; Severity</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Classifier Tahap 2 ({CONDITION_MODEL_LABEL}) hanya menilai normal/rusak. Supervisor memilih tag di bawah untuk rambu rusak; severity tag menentukan skor.
              Perubahan berlaku untuk penetapan berikutnya; temuan yang sudah memakai tag menyimpan severity-nya sendiri.
            </p>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm text-zinc-900">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white text-sm font-medium text-zinc-500"><tr><th className="px-3 py-3 font-medium">Kode</th><th className="px-3 py-3 font-medium">Label</th><th className="px-3 py-3 font-medium">Severity</th><th className="px-3 py-3 font-medium">Dipakai</th><th className="px-3 py-3 font-medium">Aktif</th><th className="px-3 py-3 font-medium" /></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {tags.map((t) => (
                  <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                    <td className="px-3 py-3 font-mono">{t.code}</td>
                    <td className="px-3 py-3"><input aria-label={`Label ${t.code}`} className={`${field} w-48`} defaultValue={t.label} onBlur={(e) => e.target.value.trim() && e.target.value !== t.label && send(`/api/admin/condition-tags/${t.id}`, 'PATCH', { label: e.target.value }, 'Label diperbarui.')} /></td>
                    <td className="px-3 py-3">
                      <select aria-label={`Severity ${t.code}`} className={field} value={t.severity} onChange={(e) => send(`/api/admin/condition-tags/${t.id}`, 'PATCH', { severity: Number(e.target.value) }, 'Severity tag diperbarui. Berlaku untuk penetapan berikutnya.')}>
                        {([1, 2, 3] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]} ({s})</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 font-mono">{t._count?.detections ?? 0}</td>
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Aktif ${t.code}`} checked={t.isActive} onChange={(e) => send(`/api/admin/condition-tags/${t.id}`, 'PATCH', { isActive: e.target.checked })} /></td>
                    <td className="px-3 py-3 text-right"><button type="button" className="font-medium text-rose-700 hover:underline" onClick={() => confirm(`Hapus tag "${t.label}"? Tag yang sudah dipakai temuan hanya dinonaktifkan.`) && send(`/api/admin/condition-tags/${t.id}`, 'DELETE', undefined, 'Tag dihapus/dinonaktifkan.')}>Hapus</button></td>
                  </tr>
                ))}
                {tags.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">Belum ada tag. Jalankan npm run seed:risk atau tambahkan di bawah.</td></tr>}
              </tbody>
            </table>
          </div>
          <form className="flex flex-wrap items-end gap-2 border-t border-zinc-100 p-3 text-xs" onSubmit={async (e) => { e.preventDefault(); if (await send('/api/admin/condition-tags', 'POST', tagDraft, 'Tag dibuat.')) setTagDraft({ ...tagDraft, code: '', label: '' }); }}>
            <label className="flex flex-col gap-1 font-medium text-zinc-900">Kode<input required className={field} value={tagDraft.code} onChange={(e) => setTagDraft({ ...tagDraft, code: e.target.value })} placeholder="panel_retak" pattern="[a-z0-9_]{2,40}" title="Huruf kecil, angka, atau _" /></label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 font-medium text-zinc-900">Label<input required className={field} value={tagDraft.label} onChange={(e) => setTagDraft({ ...tagDraft, label: e.target.value })} /></label>
            <label className="flex flex-col gap-1 font-medium text-zinc-900">Severity<select className={field} value={tagDraft.severity} onChange={(e) => setTagDraft({ ...tagDraft, severity: Number(e.target.value) })}>{([1, 2, 3] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]} ({s})</option>)}</select></label>
            <button type="submit" className="rounded-md bg-brand-green px-3 py-1.5 font-medium text-white shadow-sm hover:bg-brand-green/90">Tambah tag</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label="Zona dan Exposure">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3"><h2 className="mr-auto text-sm font-semibold text-zinc-900">Zona &amp; Tingkat Paparan (Exposure)</h2></div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm text-zinc-900">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-white text-sm font-medium text-zinc-500"><tr><th className="px-3 py-3 font-medium">Kode</th><th className="px-3 py-3 font-medium">Nama</th><th className="px-3 py-3 font-medium">Jenis</th><th className="px-3 py-3 font-medium">Exposure</th><th className="px-3 py-3 font-medium">Sesi</th><th className="px-3 py-3 font-medium">Aktif</th><th className="px-3 py-3 font-medium" /></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {zones.map((z) => (
                  <tr key={z.id} className={z.isActive ? '' : 'opacity-50'}>
                    <td className="px-3 py-3 font-mono">{z.code}</td>
                    <td className="px-3 py-3 font-medium text-zinc-900">{z.name}</td>
                    <td className="px-3 py-3">{ZONE_TYPE_LABEL[z.zoneType] ?? z.zoneType}</td>
                    <td className="px-3 py-3">
                      <select aria-label={`Exposure ${z.name}`} className={field} value={z.exposure} onChange={(e) => send(`/api/admin/zones/${z.id}`, 'PATCH', { exposure: Number(e.target.value) }, 'Exposure diperbarui. Berlaku untuk deteksi berikutnya.')}>
                        {([1, 2, 3] as Exposure[]).map((e) => <option key={e} value={e}>{EXPOSURE_LABEL[e]} ({e})</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 font-mono">{z._count?.sessions ?? 0}</td>
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Aktif ${z.name}`} checked={z.isActive} onChange={(e) => send(`/api/admin/zones/${z.id}`, 'PATCH', { isActive: e.target.checked })} /></td>
                    <td className="px-3 py-3 text-right"><button type="button" className="font-medium text-rose-700 hover:underline" onClick={() => confirm(`Hapus zona "${z.name}"? Zona yang sudah dipakai sesi hanya dinonaktifkan.`) && send(`/api/admin/zones/${z.id}`, 'DELETE', undefined, 'Zona dihapus/dinonaktifkan.')}>Hapus</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="flex flex-wrap items-end gap-2 border-t border-zinc-100 p-3 text-xs" onSubmit={async (e) => { e.preventDefault(); if (await send('/api/admin/zones', 'POST', draft, 'Zona dibuat.')) setDraft({ ...draft, code: '', name: '' }); }}>
            <label className="flex flex-col gap-1 font-medium text-zinc-900">Kode<input required className={field} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="ZN-001" /></label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 font-medium text-zinc-900">Nama<input required className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="flex flex-col gap-1 font-medium text-zinc-900">Jenis<select className={field} value={draft.zoneType} onChange={(e) => setDraft({ ...draft, zoneType: e.target.value })}>{ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_TYPE_LABEL[t]}</option>)}</select></label>
            <label className="flex flex-col gap-1 font-medium text-zinc-900">Exposure<select className={field} value={draft.exposure} onChange={(e) => setDraft({ ...draft, exposure: Number(e.target.value) })}>{([1, 2, 3] as Exposure[]).map((x) => <option key={x} value={x}>{EXPOSURE_LABEL[x]} ({x})</option>)}</select></label>
            <button type="submit" className="rounded-md bg-brand-green px-3 py-1.5 font-medium text-white shadow-sm hover:bg-brand-green/90">Tambah zona</button>
          </form>
        </section>
      </main>
    </div>
  );
}
