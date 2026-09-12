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
  versions?: any[];
  _count?: { detections: number };
}

export default function AdminClassesPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchClasses();
  }, []);

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
    setModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlertMsg(null);

    const payload = {
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
              Manajemen Kelas Deteksi Objek (Prompt Engineering)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Atur kelas pemantauan tanpa retraining model AI. Setiap perubahan disimpan dengan version snapshot.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Kelas Baru
          </button>
        </div>

        {alertMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{alertMsg.message}</span>
          </div>
        )}

        {/* Classes Table */}
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 min-w-[640px]">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Nama Kelas</th>
                    <th className="py-3.5 px-4">Deskripsi Visual AI</th>
                    <th className="py-3.5 px-4">Kriteria Kelayakan</th>
                    <th className="py-3.5 px-4">Versi & Temuan</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classes.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">{cls.displayName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">id: {cls.name}</div>
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        <p className="line-clamp-2 text-slate-700">{cls.visualDescription}</p>
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        <p className="line-clamp-2 text-slate-600">{cls.feasibilityCriteria}</p>
                      </td>
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
