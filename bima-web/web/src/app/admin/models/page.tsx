'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { CardSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import {
  Cpu,
  Plus,
  CheckCircle2,
  Trash2,
  Zap,
  Globe,
  Server,
  Loader2,
  X,
  Star,
} from 'lucide-react';

interface ModelItem {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  endpointUrl?: string;
  isDefault: boolean;
  isActive: boolean;
  apiKeyMasked: string;
  detectionsCount: number;
}

export default function AdminModelsPage() {
  const toast = useToast();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('OpenRouter');
  const [modelName, setModelName] = useState('qwen/qwen3-vl-8b-instruct');
  const [endpointUrl, setEndpointUrl] = useState('https://openrouter.ai/api/v1/chat/completions');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/models');
      const data = await res.json();
      if (data.success) {
        setModels(data.models || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat konfigurasi model.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setApiKey('');
    setModelName('qwen/qwen3-vl-8b-instruct');
    setEndpointUrl('https://openrouter.ai/api/v1/chat/completions');
    setProvider('OpenRouter');
    setIsDefault(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (m: ModelItem) => {
    setEditingId(m.id);
    setName(m.name);
    setApiKey('');
    setModelName(m.modelName);
    setEndpointUrl(m.endpointUrl || 'https://openrouter.ai/api/v1/chat/completions');
    setProvider(m.provider);
    setIsDefault(m.isDefault);
    setModalOpen(true);
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlertMsg(null);
    try {
      const url = editingId ? `/api/admin/models/${editingId}` : '/api/admin/models';
      const method = editingId ? 'PATCH' : 'POST';

      const payload: any = {
        name,
        provider,
        modelName,
        endpointUrl,
        isDefault,
      };
      if (apiKey && apiKey.trim() !== '') {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isDefault && editingId) {
          await fetch(`/api/admin/models/${editingId}/set-default`, { method: 'POST' });
        }
        setModalOpen(false);
        const msg = editingId
          ? 'Konfigurasi model & API Key berhasil diperbarui.'
          : 'Konfigurasi model AI berhasil ditambahkan.';
        toast.success(msg, 'Konfigurasi Tersimpan');
        setAlertMsg({ type: 'success', message: msg });
        fetchModels();
      } else {
        toast.error(data.error || 'Gagal menyimpan model.');
      }
    } catch {
      toast.error('Koneksi error saat menyimpan model.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/models/${id}/set-default`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Model utama berhasil diaktifkan.', 'Model Default');
        setAlertMsg({ type: 'success', message: data.message });
        fetchModels();
      } else {
        toast.error(data.error || 'Gagal mengatur model default.');
      }
    } catch {
      toast.error('Koneksi error.');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/models/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({
        id,
        success: data.success,
        message: data.message || (data.success ? 'Koneksi berhasil.' : 'Gagal terhubung.'),
      });
      if (data.success) {
        toast.success(data.message || 'Koneksi API Key model AI berhasil!', 'Tes Berhasil');
      } else {
        toast.error(data.message || 'Tes koneksi API Key gagal.');
      }
    } catch (err: any) {
      toast.error('Koneksi error saat melakukan tes API.');
      setTestResult({ id, success: false, message: 'Gagal menghubungi server endpoint.' });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Hapus atau nonaktifkan model ini?')) return;
    try {
      const res = await fetch(`/api/admin/models/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Model berhasil dinonaktifkan.', 'Model Dihapus');
        setAlertMsg({ type: 'success', message: data.message });
        fetchModels();
      } else {
        toast.error(data.error || 'Gagal menghapus model.');
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
              <Cpu className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
              Manajemen Model AI Vision & Provider
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Atur endpoint inferensi Vision-Language (Qwen3 VL 8B, OpenRouter, atau On-Premise). Secret dienkripsi dengan aman.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tambah Model AI
          </button>
        </div>

        {alertMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{alertMsg.message}</span>
          </div>
        )}

        {/* Models List */}
        {loading ? (
          <CardSkeleton count={2} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {models.map((m) => (
              <div
                key={m.id}
                className={`bg-white border rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between transition-all ${
                  m.isDefault ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        {m.provider === 'OpenRouter' ? <Globe className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 truncate">{m.name}</h3>
                        <span className="text-xs text-slate-500 font-mono truncate block">{m.modelName}</span>
                      </div>
                    </div>

                    {m.isDefault && (
                      <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center gap-1 shadow-xs shrink-0">
                        <Star className="w-3 h-3 fill-current" />
                        DEFAULT
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-100 mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Provider:</span>
                      <strong className="text-slate-800">{m.provider}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">API Key:</span>
                      <span className="font-mono text-slate-600">{m.apiKeyMasked}</span>
                    </div>
                    {m.endpointUrl && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Endpoint:</span>
                        <span className="font-mono text-slate-600 truncate max-w-[160px] sm:max-w-[200px]" title={m.endpointUrl}>
                          {m.endpointUrl}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Histori:</span>
                      <span className="text-slate-700">{m.detectionsCount} data deteksi</span>
                    </div>
                  </div>

                  {testResult && testResult.id === m.id && (
                    <div
                      className={`p-2.5 rounded-xl text-xs mb-4 flex items-center gap-2 ${
                        testResult.success
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span className="break-words">{testResult.message}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleTestConnection(m.id)}
                      disabled={testingId === m.id}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      {testingId === m.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      Test Koneksi
                    </button>

                    <button
                      onClick={() => handleOpenEdit(m)}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-colors"
                      title="Ubah konfigurasi atau masukkan API Key"
                    >
                      Edit Key
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {!m.isDefault && (
                      <button
                        onClick={() => handleSetDefault(m.id)}
                        className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer active:scale-95"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteModel(m.id)}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Hapus Model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* CREATE / EDIT MODEL MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveModel}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-600 shrink-0" />
                {editingId ? 'Edit Model & API Key' : 'Tambah Konfigurasi Model AI'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Konfigurasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Qwen3 VL 8B Vision Production"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    if (e.target.value === 'onpremise') {
                      setEndpointUrl('http://localhost:8000/v1/vision');
                    } else {
                      setEndpointUrl('https://openrouter.ai/api/v1/chat/completions');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="OpenRouter">OpenRouter (Cloud API)</option>
                  <option value="onpremise">On-Premise (Local Vision Endpoint)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Model Identifier Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: qwen/qwen3-vl-8b-instruct"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Endpoint URL</label>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  API Key Secret (Akan dienkripsi aman dengan AES-256)
                </label>
                <input
                  type="password"
                  placeholder={editingId ? 'Masukkan API Key baru jika ingin mengubah' : 'sk-or-v1-...'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isDef"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isDef" className="font-semibold text-slate-700 cursor-pointer">
                  Tetapkan sebagai model default aktif
                </label>
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
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Model'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
