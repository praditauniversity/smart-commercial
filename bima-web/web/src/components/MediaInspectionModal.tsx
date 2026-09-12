'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  Trash2,
  RefreshCw,
  MapPin,
  Calendar,
  Clock,
  Cpu,
  Layers,
  FileImage,
  Info,
  Sparkles,
} from 'lucide-react';
import MediaBoxOverlay, { OverlayDetection, BoundingBox } from './MediaBoxOverlay';
import FindingLocationMap from './FindingLocationMap';
import { useToast } from './ToastProvider';

interface ClassItem {
  id: string;
  name: string;
  displayName: string;
}

interface DetectionRecord {
  id: string;
  sessionId: string;
  mediaAssetId: string;
  classId?: string | null;
  className: string;
  bbox: string; // JSON string of BoundingBox
  condition: string;
  feasibility: 'layak' | 'cukup_layak' | 'tidak_layak';
  locationGeojson?: string | null;
  timestampSeconds?: number | null;
  frameIndex?: number | null;
  modelName?: string | null;
  hasConflict?: boolean;
  conflictResolved?: boolean;
  conflictDetails?: string | null;
  createdAt: string;
  classDefinition?: ClassItem | null;
}

interface MediaAssetData {
  id: string;
  sessionId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface SessionData {
  id: string;
  name: string;
  surveyDate: string;
  locationType?: 'point' | 'polygon';
  locationGeojson?: any;
  locationAddress?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
}

interface MediaInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaAsset: MediaAssetData | null;
  session: SessionData | null;
  detections: DetectionRecord[];
  activeClasses: ClassItem[];
  canEdit: boolean;
  onSaved: () => void;
}

export default function MediaInspectionModal({
  isOpen,
  onClose,
  mediaAsset,
  session,
  detections,
  activeClasses,
  canEdit,
  onSaved,
}: MediaInspectionModalProps) {
  const toast = useToast();
  const [selectedDetId, setSelectedDetId] = useState<string | null>(null);
  const [editStates, setEditStates] = useState<
    Record<
      string,
      {
        classId: string;
        condition: string;
        feasibility: 'layak' | 'cukup_layak' | 'tidak_layak';
        locationGeojson?: any;
      }
    >
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Helper to extract a Point object from detection or session
  const extractPointGeojson = (detGeo: any, sessionGeo: any) => {
    if (detGeo) {
      try {
        const parsed = typeof detGeo === 'string' ? JSON.parse(detGeo) : detGeo;
        if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
          return parsed;
        }
      } catch {}
    }
    if (sessionGeo) {
      try {
        const sGeo = typeof sessionGeo === 'string' ? JSON.parse(sessionGeo) : sessionGeo;
        if (sGeo.type === 'Point' && Array.isArray(sGeo.coordinates)) {
          return sGeo;
        }
        if (sGeo.type === 'Polygon' && Array.isArray(sGeo.coordinates?.[0]) && sGeo.coordinates[0].length > 0) {
          return { type: 'Point', coordinates: [sGeo.coordinates[0][0][0], sGeo.coordinates[0][0][1]] };
        }
      } catch {}
    }
    return null;
  };

  // Initialize edit states when modal opens
  useEffect(() => {
    if (!isOpen || !detections) return;
    const initial: Record<
      string,
      {
        classId: string;
        condition: string;
        feasibility: 'layak' | 'cukup_layak' | 'tidak_layak';
        locationGeojson?: any;
      }
    > = {};

    for (const det of detections) {
      initial[det.id] = {
        classId: det.classId || (activeClasses.find((c) => c.name === det.className)?.id ?? ''),
        condition: det.condition || '',
        feasibility: det.feasibility || 'cukup_layak',
        locationGeojson: extractPointGeojson(det.locationGeojson, session?.locationGeojson),
      };
    }
    setEditStates(initial);
    if (detections.length > 0) {
      setSelectedDetId(detections[0].id);
    } else {
      setSelectedDetId(null);
    }
    setFeedback(null);
  }, [isOpen, mediaAsset?.id]);

  if (!isOpen || !mediaAsset) return null;

  // Build overlay detections for left side view
  const overlayDetections: OverlayDetection[] = detections.map((det) => {
    let bbox: BoundingBox = { x: 0, y: 0, width: 0.1, height: 0.1 };
    try {
      bbox = JSON.parse(det.bbox);
    } catch {}

    const currentEdit = editStates[det.id];
    const currentClassDef = activeClasses.find((c) => c.id === currentEdit?.classId) || det.classDefinition;

    return {
      id: det.id,
      className: currentClassDef?.name || det.className,
      displayName: currentClassDef?.displayName || det.classDefinition?.displayName || det.className,
      bbox,
      condition: currentEdit?.condition || det.condition,
      feasibility: currentEdit?.feasibility || det.feasibility,
      hasConflict: det.hasConflict && !det.conflictResolved,
      conflictDetails: det.conflictDetails ? JSON.parse(det.conflictDetails) : undefined,
    };
  });

  const handleFieldChange = (
    detId: string,
    field: 'classId' | 'condition' | 'feasibility' | 'locationGeojson',
    val: any
  ) => {
    setEditStates((prev) => ({
      ...prev,
      [detId]: {
        ...prev[detId],
        [field]: val,
      },
    }));
  };

  const handleLocationChange = (geo: any) => {
    if (selectedDetId) {
      handleFieldChange(selectedDetId, 'locationGeojson', geo);
    } else {
      setEditStates((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          next[k] = { ...next[k], locationGeojson: geo };
        }
        return next;
      });
    }
  };

  const handleSaveDetection = async (detId: string) => {
    const edit = editStates[detId];
    if (!edit) return;

    setSavingId(detId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/detections/${detId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: edit.classId,
          condition: edit.condition,
          feasibility: edit.feasibility,
          locationGeojson: edit.locationGeojson,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Perubahan data dan titik peta temuan berhasil disimpan ke database.', 'Data Tersimpan');
        setFeedback({ type: 'success', message: 'Perubahan data & lokasi deteksi berhasil disimpan ke database.' });
        onSaved();
      } else {
        toast.error(data.error || 'Gagal menyimpan perubahan deteksi.');
        setFeedback({ type: 'error', message: data.error || 'Gagal menyimpan perubahan deteksi.' });
      }
    } catch {
      toast.error('Koneksi error saat menyimpan deteksi.');
      setFeedback({ type: 'error', message: 'Koneksi error saat menyimpan deteksi.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAll = async () => {
    setSaveAllLoading(true);
    setFeedback(null);
    try {
      for (const det of detections) {
        const edit = editStates[det.id];
        if (edit) {
          await fetch(`/api/detections/${det.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              classId: edit.classId,
              condition: edit.condition,
              feasibility: edit.feasibility,
              locationGeojson: edit.locationGeojson,
            }),
          });
        }
      }
      toast.success('Semua perubahan data dan titik peta berhasil disimpan.', 'Semua Data Tersimpan');
      setFeedback({ type: 'success', message: 'Semua perubahan data & lokasi deteksi berhasil disimpan ke database.' });
      onSaved();
    } catch {
      toast.error('Gagal menyimpan semua perubahan.');
      setFeedback({ type: 'error', message: 'Gagal menyimpan semua perubahan.' });
    } finally {
      setSaveAllLoading(false);
    }
  };

  const handleDeleteDetection = async (detId: string) => {
    if (!confirm('Hapus deteksi objek ini?')) return;
    setSavingId(detId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/detections/${detId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Deteksi objek berhasil dihapus.', 'Deteksi Dihapus');
        setFeedback({ type: 'success', message: 'Deteksi berhasil dihapus.' });
        onSaved();
      } else {
        toast.error(data.error || 'Gagal menghapus deteksi.');
        setFeedback({ type: 'error', message: data.error || 'Gagal menghapus deteksi.' });
      }
    } catch {
      toast.error('Koneksi error saat menghapus deteksi.');
      setFeedback({ type: 'error', message: 'Koneksi error saat menghapus deteksi.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleRetryProcessing = async () => {
    setRetrying(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/media/${mediaAsset.id}/process`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Media berhasil di-rescan.', 'Rescan Selesai');
        setFeedback({
          type: 'success',
          message: 'Media berhasil di-rescan.',
        });
        onSaved();
      } else {
        toast.error(data.error || 'Gagal memproses ulang media.');
        setFeedback({ type: 'error', message: data.error || 'Gagal memproses ulang media.' });
      }
    } catch {
      toast.error('Koneksi error saat memproses ulang.');
      setFeedback({ type: 'error', message: 'Koneksi error saat memproses ulang.' });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
              <FileImage className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[180px] sm:max-w-md">
                  {mediaAsset.fileName}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                    mediaAsset.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : mediaAsset.status === 'processing'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                      : mediaAsset.status === 'failed'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {mediaAsset.status}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                {canEdit
                  ? `Mode Edit (${detections.length} objek teridentifikasi)`
                  : `Mode Pratinjau (${detections.length} objek)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={handleRetryProcessing}
                disabled={retrying || mediaAsset.status === 'processing'}
                className="px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Scan ulang media"
              >
                {retrying || mediaAsset.status === 'processing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{retrying ? 'Memproses...' : 'Rescan AI'}</span>
              </button>
            )}

            {canEdit && detections.length > 1 && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saveAllLoading}
                className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {saveAllLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span className="hidden xs:inline">Simpan Semua</span> ({detections.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
              title="Tutup"
            >
              <X className="w-4 h-4" />
              <span>Tutup</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert Bar */}
        {feedback && (
          <div
            className={`px-4 sm:px-6 py-2.5 text-xs flex items-center justify-between gap-2 border-b shrink-0 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body: Split Two Columns on desktop, stacked on mobile */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto">
          {/* LEFT SIDE: Media Visual & Bounding Box Overlays */}
          <div className="lg:col-span-5 p-4 sm:p-5 bg-slate-950 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Visual Bounding Box AI
                </span>
                <span>{overlayDetections.length} Objek</span>
              </div>

              {/* Media Image / Video with Overlays */}
              <div className="relative min-h-[220px] sm:min-h-[300px] md:min-h-[360px] bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
                {mediaAsset.status === 'processing' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                    <p className="font-semibold text-sm text-slate-200">AI Sedang Menganalisis Media...</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Sedang memproses deteksi objek dan penilaian kelayakan infrastruktur.
                    </p>
                  </div>
                ) : (
                  <MediaBoxOverlay
                    mediaUrl={mediaAsset.fileUrl}
                    mediaType={mediaAsset.fileType as any}
                    detections={overlayDetections}
                    selectedDetectionId={selectedDetId}
                    onSelectDetection={(d) => setSelectedDetId(d.id)}
                    className="w-full h-full"
                  />
                )}
              </div>

              {mediaAsset.status === 'failed' && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-200">AI Processing Gagal:</strong>
                      <span className="text-[11px] leading-relaxed">{mediaAsset.errorMessage || 'Error tidak diketahui'}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRetryProcessing}
                      disabled={retrying}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Proses Ulang AI (Retry)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Media File Specs */}
            <div className="pt-3 mt-3 border-t border-slate-800 text-[10px] sm:text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
              <span>Tipe: <strong className="text-slate-200 uppercase">{mediaAsset.fileType}</strong></span>
              <span>Upload: <strong className="text-slate-200">{new Date(mediaAsset.createdAt).toLocaleDateString('id-ID')}</strong></span>
            </div>
          </div>

          {/* RIGHT SIDE: AI Analysis Results, Metadata & Editing Form */}
          <div className="lg:col-span-7 p-4 sm:p-6 space-y-5 sm:space-y-6 bg-white overflow-y-auto">
            {/* Session Context Metadata Box */}
            {session && (
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    Informasi Sesi Survei
                  </span>
                  <span className="text-slate-500 font-normal text-[11px]">
                    Status: <strong className="text-slate-700 uppercase">{session.status.replace(/_/g, ' ')}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Nama Sesi:</span>
                    <strong className="text-slate-900 break-words">{session.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Lokasi Survei:</span>
                    <span className="flex items-center gap-1 text-slate-800 break-words" title={session.locationAddress || '-'}>
                      <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                      {session.locationAddress || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Tanggal Survei:</span>
                    <span className="flex items-center gap-1 text-slate-800">
                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                      {new Date(session.surveyDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Waktu Mulai:</span>
                    <span className="flex items-center gap-1 text-slate-800">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      {new Date(session.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      {session.finishedAt && ` • Selesai: ${new Date(session.finishedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Location Map */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <FindingLocationMap
                sessionLocationType={session?.locationType || 'point'}
                sessionGeojson={session?.locationGeojson}
                sessionAddress={session?.locationAddress}
                initialPointGeojson={
                  (selectedDetId && editStates[selectedDetId]?.locationGeojson) ||
                  (detections[0] && editStates[detections[0].id]?.locationGeojson) ||
                  session?.locationGeojson
                }
                canEdit={canEdit}
                onLocationChange={handleLocationChange}
              />
            </div>

            {/* Detections List & Editing Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600 shrink-0" />
                  Hasil Temuan AI ({detections.length})
                </h3>
              </div>

              {detections.length === 0 ? (
                <div className="p-6 sm:p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-400 space-y-2">
                  <Layers className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700 text-sm">0 Objek Terdeteksi oleh AI pada media ini.</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {mediaAsset.status === 'completed'
                      ? 'AI telah menyelesaikan inferensi dan tidak menemukan kerusakan infrastruktur yang memenuhi kriteria kelas aktif.'
                      : mediaAsset.status === 'processing'
                      ? 'Media sedang dalam antrean pemrosesan AI.'
                      : 'Pemrosesan belum selesai atau mengalami kegagalan.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {detections.map((det, idx) => {
                    const isSelected = selectedDetId === det.id;
                    const edit = editStates[det.id] || {
                      classId: det.classId || '',
                      condition: det.condition,
                      feasibility: det.feasibility,
                    };
                    const isSaving = savingId === det.id;

                    let bboxObj = { x: 0, y: 0, width: 0, height: 0 };
                    try {
                      bboxObj = JSON.parse(det.bbox);
                    } catch {}

                    return (
                      <div
                        key={det.id}
                        onClick={() => setSelectedDetId(det.id)}
                        className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Detection Card Header */}
                        <div className="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
                          <div>
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                              Objek #{idx + 1}
                            </span>
                            <h4 className="font-bold text-sm text-slate-900 break-words">
                              {activeClasses.find((c) => c.id === edit.classId)?.displayName ||
                                det.classDefinition?.displayName ||
                                det.className}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                                edit.feasibility === 'tidak_layak'
                                  ? 'bg-rose-100 text-rose-800'
                                  : edit.feasibility === 'cukup_layak'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {edit.feasibility.replace('_', ' ')}
                            </span>

                            {canEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDetection(det.id);
                                }}
                                disabled={isSaving}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Deteksi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Technical Metadata Snippet */}
                        <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] sm:text-[11px] bg-slate-50 p-2.5 rounded-lg text-slate-500">
                          <div>
                            <span className="text-slate-400 block text-[9px]">Model AI:</span>
                            <span className="font-mono text-slate-700 font-semibold truncate block">{det.modelName || 'qwen3-vl-8b'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Bounding Box:</span>
                            <span className="font-mono text-slate-700 truncate block">
                              [{bboxObj.x.toFixed(2)}, {bboxObj.y.toFixed(2)}]
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Waktu Deteksi:</span>
                            <span className="text-slate-700">{new Date(det.createdAt).toLocaleTimeString('id-ID')}</span>
                          </div>
                        </div>

                        {/* Editable Form Fields */}
                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Kelas Objek <span className="text-rose-500">*</span>
                            </label>
                            {canEdit ? (
                              <select
                                value={edit.classId}
                                onChange={(e) => handleFieldChange(det.id, 'classId', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-xs sm:text-sm"
                              >
                                {activeClasses.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.displayName} ({c.name})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium">
                                {det.classDefinition?.displayName || det.className}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Deskripsi Kondisi / Kerusakan <span className="text-rose-500">*</span>
                            </label>
                            {canEdit ? (
                              <textarea
                                rows={2}
                                value={edit.condition}
                                onChange={(e) => handleFieldChange(det.id, 'condition', e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs sm:text-sm"
                                placeholder="Jelaskan kondisi kerusakan objek..."
                              />
                            ) : (
                              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 break-words">
                                {det.condition}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Tingkat Kelayakan <span className="text-rose-500">*</span>
                            </label>
                            {canEdit ? (
                              <select
                                value={edit.feasibility}
                                onChange={(e) =>
                                  handleFieldChange(
                                    det.id,
                                    'feasibility',
                                    e.target.value as 'layak' | 'cukup_layak' | 'tidak_layak'
                                  )
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-xs sm:text-sm"
                              >
                                <option value="layak">Layak (Good / Berfungsi Normal)</option>
                                <option value="cukup_layak">Cukup Layak (Fair / Perlu Perhatian)</option>
                                <option value="tidak_layak">Tidak Layak (Poor / Rusak Berat)</option>
                              </select>
                            ) : (
                              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium capitalize">
                                {det.feasibility.replace('_', ' ')}
                              </div>
                            )}
                          </div>

                          {canEdit && (
                            <div className="pt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveDetection(det.id);
                                }}
                                disabled={isSaving}
                                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                              >
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Simpan Perubahan Objek
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

