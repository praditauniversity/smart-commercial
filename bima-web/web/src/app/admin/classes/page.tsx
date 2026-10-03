'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { TableSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  Loader2,
  X,
  History,
} from 'lucide-react';

interface ClassItem {
  id: string;
  name: string;
  displayName: string;
  visualDescription: string;
  conditionCriteria: string;
  feasibilityCriteria: string;
  isActive: boolean;
  mutuallyExclusiveWith: string;
  conflictIouThreshold: number;
  samPrompt?: string | null;
  samColor?: string | null;
  modelClass?: string | null;
  category?: string | null;
  versions?: any[];
  _count?: { detections: number };
}

export default function AdminClassesPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Mode halaman mengikuti model aktif: YOLO (detektor terlatih, tanpa prompt), SAM3 (SAM prompt),
  // atau VLM (deskripsi visual). Ketiganya tidak pernah dicampur dalam satu form.
  const [engine, setEngine] = useState<'yolo' | 'sam3' | 'vlm' | null>(null);
  const [activeModelName, setActiveModelName] = useState('');

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formVisual, setFormVisual] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [formFeasibility, setFormFeasibility] = useState('');
  const [formMutual, setFormMutual] = useState<string[]>([]);
  const [formIou, setFormIou] = useState(0.5);
  const [formSamPrompt, setFormSamPrompt] = useState('');
  const [formSamColor, setFormSamColor] = useState('#ff0000');

  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/classes');
      const data = await res.json();
      if (data.success) {
        setClasses(data.classes || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat taksonomi kelas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveModel = async () => {
    try {
      const res = await fetch('/api/admin/models');
      const data = await res.json();
      const models: any[] = data.models || [];
      const active = models.find((m) => m.isDefault && m.isActive) || models.find((m) => m.isActive);
      const provider = active?.provider?.toLowerCase();
      setEngine(provider === 'yolo' ? 'yolo' : provider === 'sam3' ? 'sam3' : 'vlm');
      setActiveModelName(active?.name || '');
    } catch {
      setEngine('vlm');
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchActiveModel();
  }, []);

  const isSam = engine === 'sam3';
  const isYolo = engine === 'yolo';
  const visibleClasses = classes;

  const openCreateModal = () => {
    setEditingClass(null);
    setFormName('');
    setFormDisplayName('');
    setFormVisual('');
    setFormCondition('');
    setFormFeasibility(
      'Layak: kondisi baik/normal; Cukup Layak: sedikit aus namun berfungsi; Tidak Layak: rusak berat dan membahayakan.'
    );
    setFormMutual([]);
    setFormIou(0.5);
    setFormSamPrompt('');
    setFormSamColor('#ff0000');
    setModalOpen(true);
  };

  const openEditModal = (cls: ClassItem) => {
    setEditingClass(cls);
    setFormName(cls.name);
    setFormDisplayName(cls.displayName);
    setFormVisual(cls.visualDescription);
    setFormCondition(cls.conditionCriteria);
    setFormFeasibility(cls.feasibilityCriteria);
    try {
      setFormMutual(JSON.parse(cls.mutuallyExclusiveWith || '[]'));
    } catch {
      setFormMutual([]);
    }
    setFormIou(cls.conflictIouThreshold || 0.5);
    setFormSamPrompt(cls.samPrompt || '');
    setFormSamColor(cls.samColor || '#ff0000');
    setModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlertMsg(null);

    const payload: any = isYolo
      ? { displayName: formDisplayName }
      : isSam
      ? {
          name: formName,
          displayName: formDisplayName,
          samPrompt: formSamPrompt.trim(),
          samColor: formSamColor,
          // Required by the schema but unused by SAM3
          ...(editingClass
            ? {}
            : {
                visualDescription: formSamPrompt.trim(),
                conditionCriteria: 'Dinilai dari hasil segmentasi SAM3 (jumlah instance dan luas area).',
                feasibilityCriteria:
                  'Layak: tidak ada temuan; Cukup Layak: temuan kecil; Tidak Layak: temuan banyak atau luas area besar.',
              }),
        }
      : {
          name: formName,
          displayName: formDisplayName,
          visualDescription: formVisual,
          conditionCriteria: formCondition,
          feasibilityCriteria: formFeasibility,
          mutuallyExclusiveWith: formMutual,
          conflictIouThreshold: formIou,
        };

    try {
      let res;
      if (editingClass) {
        res = await fetch(`/api/admin/classes/${editingClass.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (res.ok) {
        setModalOpen(false);
        const msg = editingClass
          ? 'Kelas berhasil diperbarui dan versi snapshot baru dibuat.'
          : 'Kelas deteksi baru berhasil ditambahkan.';
        toast.success(msg, 'Taksonomi Tersimpan');
        setAlertMsg({ type: 'success', message: msg });
        fetchClasses();
      } else {
        toast.error(data.error || 'Gagal menyimpan kelas.');
      }
    } catch {
      toast.error('Koneksi error saat menyimpan kelas.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm('Hapus atau nonaktifkan kelas ini?')) return;
    try {
      const res = await fetch(`/api/admin/classes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Kelas berhasil dinonaktifkan.', 'Kelas Diperbarui');
        setAlertMsg({ type: 'success', message: data.message });
        fetchClasses();
      } else {
        toast.error(data.error || 'Gagal menghapus kelas.');
      }
    } catch {
      toast.error('Koneksi error.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Layers className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
              {isYolo ? 'Manajemen Kelas Deteksi Objek' : 'Manajemen Kelas Deteksi Objek (Prompt Engineering)'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isYolo
                ? 'Kelas ditentukan oleh model YOLO yang sudah dilatih, tanpa prompt. Di sini admin mengatur nama tampilan dan status aktif kelas; kategori, kelompok, dan Severity ada di Data Master Risiko. Menambah kelas baru memerlukan pelatihan ulang model. Deskripsi naratif video (video-to-text) juga tidak diatur lewat halaman ini.'
                : 'Atur kelas pemantauan tanpa retraining model AI. Setiap perubahan disimpan dengan version snapshot.'}
            </p>
            {engine && (
              <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {isYolo ? 'Mode: YOLO (detektor terlatih)' : `Mode prompt: ${isSam ? 'SAM3 Lokal (SAM Prompt)' : 'VLM (Deskripsi Visual)'}`}
                {activeModelName && <span className="text-blue-500 font-normal">· model aktif: {activeModelName}</span>}
              </p>
            )}
          </div>

          {!isYolo && <button
            type="button"
            onClick={openCreateModal}
            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Kelas Baru
          </button>}
        </div>

        {alertMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{alertMsg.message}</span>
          </div>
        )}

        {/* Classes Table */}
        {loading || engine === null ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-xs text-slate-600 min-w-[640px]">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Nama Kelas</th>
                    {isYolo ? (
                      <>
                        <th className="py-3.5 px-4">Kelas keluaran model</th>
                        <th className="py-3.5 px-4">Kategori</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3.5 px-4">{isSam ? 'SAM Prompt' : 'Deskripsi Visual AI'}</th>
                        {!isSam && <th className="py-3.5 px-4">Kriteria Kelayakan</th>}
                      </>
                    )}
                    <th className="py-3.5 px-4">Versi & Temuan</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleClasses.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{cls.displayName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">id: {cls.name}</div>
                      </td>
                      {isYolo ? (
                        <>
                          <td className="py-4 px-4 font-mono text-[11px] text-slate-700">{cls.modelClass || <span className="font-sans text-slate-400">tidak dipakai YOLO</span>}</td>
                          <td className="py-4 px-4 text-slate-700">{cls.category || '-'}</td>
                        </>
                      ) : isSam ? (
                        <td className="py-4 px-4 max-w-xs">
                          <p className="flex items-start gap-1.5 text-slate-700">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                              style={{ backgroundColor: cls.samColor || '#ef4444' }}
                            />
                            {cls.samPrompt?.trim() ? (
                              <span className="line-clamp-2">{cls.samPrompt}</span>
                            ) : (
                              <span className="text-amber-600 font-semibold">
                                Belum diisi (dilewati SAM3)
                              </span>
                            )}
                          </p>
                        </td>
                      ) : (
                        <>
                          <td className="py-4 px-4 max-w-xs">
                            <p className="line-clamp-2 text-slate-700">{cls.visualDescription}</p>
                          </td>
                          <td className="py-4 px-4 max-w-xs">
                            <p className="line-clamp-2 text-slate-600">{cls.feasibilityCriteria}</p>
                          </td>
                        </>
                      )}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <History className="w-3.5 h-3.5 text-blue-500" />
                          Versi {cls.versions?.length || 1}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {cls._count?.detections || 0} data deteksi
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            cls.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {cls.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(cls)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit kelas"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClass(cls.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus / Nonaktifkan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* CREATE / EDIT CLASS MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveClass}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600 shrink-0" />
                {editingClass ? 'Edit Konfigurasi Kelas' : 'Tambah Kelas Deteksi Baru'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Label Tampilan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rambu Jalan Rusak"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {!editingClass && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    System Identifier Name (Snake_case) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: rambu_jalan_rusak"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {isYolo ? (
                editingClass?.modelClass && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                    Kelas keluaran model: <span className="font-mono font-semibold text-slate-800">{editingClass.modelClass}</span> (tetap; ditentukan oleh weight YOLO).
                  </p>
                )
              ) : isSam ? (
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-2">
                <label className="block font-semibold text-slate-700">
                  SAM Prompt {!editingClass && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  required={!editingClass}
                  rows={2}
                  placeholder='Frasa benda dalam bahasa Inggris, contoh: "pothole on the road, damaged asphalt hole."'
                  value={formSamPrompt}
                  onChange={(e) => setFormSamPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-700">Warna overlay</label>
                  <input
                    type="color"
                    value={formSamColor}
                    onChange={(e) => setFormSamColor(e.target.value)}
                    className="h-7 w-10 p-0 border border-slate-200 rounded cursor-pointer bg-white"
                  />
                  {editingClass && (
                    <span className="text-[11px] text-slate-500">Kosongkan prompt agar kelas ini dilewati SAM3.</span>
                  )}
                </div>
              </div>
              ) : (
                <>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Deskripsi Visual untuk AI Prompt <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Jelaskan karakteristik visual objek yang harus dicari AI..."
                  value={formVisual}
                  onChange={(e) => setFormVisual(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kriteria Kondisi Objek <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kerusakan fisik tiang atau daun rambu"
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kriteria Tingkat Kelayakan (Kualitatif) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={formFeasibility}
                  onChange={(e) => setFormFeasibility(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  IoU Conflict Threshold (Default 0.5)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.9"
                  value={formIou}
                  onChange={(e) => setFormIou(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
                </>
              )}
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
