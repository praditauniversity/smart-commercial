'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MediaBoxOverlay, { OverlayDetection } from '@/components/MediaBoxOverlay';
import MediaInspectionModal from '@/components/MediaInspectionModal';
import { useToast } from '@/components/ToastProvider';
import { DetailWorkspaceSkeleton } from '@/components/SkeletonLoaders';
import {
  MapPin,
  Calendar,
  Clock,
  UploadCloud,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Edit3,
  Send,
  Lock,
  Layers,
  ChevronRight,
  Loader2,
  X,
  Plus,
  Play,
  Square,
  AlertCircle,
  Eye,
  Sparkles,
} from 'lucide-react';

interface MediaAssetItem {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  status: string;
  errorMessage?: string;
  durationSeconds?: number;
  segments?: any[];
  _count?: { detections: number };
}

interface DetectionItem {
  id: string;
  mediaAssetId: string;
  classId: string;
  className: string;
  classDefinition?: { displayName: string; visualDescription: string };
  bbox: string;
  condition: string;
  feasibility: 'layak' | 'cukup_layak' | 'tidak_layak';
  hasConflict: boolean;
  conflictResolved: boolean;
  conflictDetails: string;
  mediaAsset?: { fileUrl: string; fileType: string; fileName: string };
}

export default function SurveyorSessionWorkspace() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'findings' | 'media' | 'live' | 'history'>('findings');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');

  // Media Inspection Modal state
  const [inspectingMediaId, setInspectingMediaId] = useState<string | null>(null);

  // Media upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Live mode state
  const [liveActive, setLiveActive] = useState(false);
  const [liveOverlayDetections, setLiveOverlayDetections] = useState<OverlayDetection[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Conflict modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [activeConflictDetection, setActiveConflictDetection] = useState<DetectionItem | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

  // Edit metadata modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Notification / Alert
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rescaningAll, setRescaningAll] = useState(false);

  const fetchSessionDetails = async (retryCount = 0) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (data.success && data.session) {
        setSession(data.session);
        setEditName(data.session.name);
        setEditAddress(data.session.locationAddress || '');
        setLoading(false);
      } else {
        if (retryCount < 2) {
          setTimeout(() => fetchSessionDetails(retryCount + 1), 300 * (retryCount + 1));
          return;
        }
        setActionAlert({ type: 'error', message: data.error || 'Gagal memuat sesi survei.' });
        setLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      if (retryCount < 2) {
        setTimeout(() => fetchSessionDetails(retryCount + 1), 300 * (retryCount + 1));
        return;
      }
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/admin/classes');
      const data = await res.json();
      if (data.success) {
        setAvailableClasses(data.classes || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchSessionDetails();
    fetchClasses();
  }, [sessionId]);

  // Polling for processing media assets
  useEffect(() => {
    if (!session) return;
    const hasProcessing = session.mediaAssets?.some((m: MediaAssetItem) =>
      ['queued', 'uploading', 'processing'].includes(m.status)
    );

    if (hasProcessing) {
      const interval = setInterval(() => {
        fetchSessionDetails();
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [session]);

  // Handle Multi-file Upload (US-002)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(`Menyiapkan ${files.length} file media...`);
    setActionAlert(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Mengupload file (${i + 1}/${files.length}): ${file.name}...`);

        // Convert file to Base64 data URL
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const isVideo = file.type.includes('video') || file.name.endsWith('.mp4');

        // 1. Register MediaAsset in Supabase Database
        const regRes = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            fileName: file.name,
            fileType: isVideo ? 'video' : 'image',
            fileUrl: dataUrl,
          }),
        });

        const regData = await regRes.json();
        if (!regRes.ok) {
          throw new Error(regData.error || `Gagal mendaftarkan file ${file.name}`);
        }

        const mediaId = regData.mediaAsset.id;
        await fetchSessionDetails();

        // 2. Trigger real AI processing pipeline
        setUploadProgress(`AI Vision sedang menganalisis (${i + 1}/${files.length}): ${file.name}...`);
        try {
          const procRes = await fetch(`/api/media/${mediaId}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const procData = await procRes.json();
          if (!procRes.ok && procData.error) {
            console.warn('AI processing warning:', procData.error);
          }
        } catch (procErr: any) {
          console.error('AI processing connection error:', procErr);
        }

        await fetchSessionDetails();
      }

      setUploadProgress(null);
      setUploading(false);
      toast.success(`${files.length} file berhasil diunggah dan dianalisis AI!`, 'Upload Selesai');
      await fetchSessionDetails();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal mengunggah media.');
      setActionAlert({ type: 'error', message: err.message || 'Gagal mengupload media.' });
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // Rescan Single Media
  const handleRescanSingleMedia = async (mediaId: string, fileName: string) => {
    setActionAlert(null);
    setUploadProgress(`Rescan: ${fileName}...`);
    try {
      const res = await fetch(`/api/media/${mediaId}/process`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Media "${fileName}" berhasil di-rescan.`, 'Rescan Berhasil');
        setActionAlert({ type: 'success', message: `Media "${fileName}" berhasil di-rescan.` });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal memproses ulang media.');
      }
    } catch {
      toast.error('Koneksi error saat rescan media.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Rescan All Media
  const handleRescanAllMedia = async () => {
    const assets = session?.mediaAssets || [];
    if (assets.length === 0) return;
    if (!confirm(`Jalankan rescan AI pada semua (${assets.length}) file media?`)) return;

    setRescaningAll(true);
    setActionAlert(null);
    try {
      let successCount = 0;
      for (let i = 0; i < assets.length; i++) {
        const media = assets[i];
        setUploadProgress(`Rescan (${i + 1}/${assets.length}): ${media.fileName}...`);
        try {
          const res = await fetch(`/api/media/${media.id}/process`, { method: 'POST' });
          if (res.ok) {
            successCount++;
          }
        } catch (e) {
          console.error(`Gagal rescan media ${media.fileName}:`, e);
        }
        await fetchSessionDetails();
      }

      toast.success(
        `Rescan selesai untuk ${successCount} media.`,
        'Rescan Selesai'
      );
      setActionAlert({
        type: 'success',
        message: `Rescan selesai untuk ${successCount} media.`,
      });
      await fetchSessionDetails();
    } catch (err: any) {
      toast.error('Gagal menjalankan rescan media.');
    } finally {
      setRescaningAll(false);
      setUploadProgress(null);
    }
  };

  // Retry Failed Media
  const handleRetryMedia = async (mediaId: string) => {
    setActionAlert(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Permintaan proses ulang AI berhasil dikirim.', 'Proses Ulang');
        setActionAlert({ type: 'success', message: 'Retry processing berhasil dikirim.' });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal melakukan retry.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal melakukan retry.' });
      }
    } catch {
      toast.error('Koneksi error saat retry media.');
      setActionAlert({ type: 'error', message: 'Koneksi error saat retry media.' });
    }
  };

  // Delete Media
  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus media ini secara permanen beserta hasil deteksinya?')) {
      return;
    }
    setActionAlert(null);
    try {
      const res = await fetch(`/api/media/${mediaId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Media dan temuan terkait berhasil dihapus.', 'Media Dihapus');
        setActionAlert({ type: 'success', message: 'Media berhasil dihapus.' });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal menghapus media.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal menghapus media.' });
      }
    } catch {
      toast.error('Koneksi error saat menghapus media.');
      setActionAlert({ type: 'error', message: 'Koneksi error saat menghapus media.' });
    }
  };

  // Live Camera Mode (US-003)
  const startLiveCamera = async () => {
    setLiveActive(true);
    setActionAlert(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      toast.info('Kamera live aktif. AI sedang memantau frame video.', 'Kamera Aktif');

      // Sampling frames periodically (~1 frame every 1.5 seconds)
      liveIntervalRef.current = setInterval(() => {
        captureAndDetectLiveFrame();
      }, 1500);
    } catch (err: any) {
      console.error('Camera access error:', err);
      toast.error('Tidak dapat mengakses kamera perangkat. Pastikan izin kamera telah diberikan.');
      setActionAlert({
        type: 'error',
        message: 'Tidak dapat mengakses kamera perangkat. Pastikan izin kamera telah diberikan.',
      });
      setLiveActive(false);
    }
  };

  const stopLiveCamera = () => {
    setLiveActive(false);
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setLiveOverlayDetections([]);
    toast.info('Kamera live dinonaktifkan.', 'Kamera Berhenti');
  };

  const captureAndDetectLiveFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frameBase64 = canvas.toDataURL('image/jpeg', 0.6);

    try {
      const res = await fetch('/api/live/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameBase64 }),
      });
      const data = await res.json();
      if (data.detections) {
        const formatted: OverlayDetection[] = data.detections.map((d: any, idx: number) => ({
          id: `live-${idx}`,
          className: d.class_name,
          displayName: d.class_name,
          bbox: d.bbox,
          condition: d.condition,
          feasibility: d.feasibility,
          hasConflict: d.has_conflict,
          conflictDetails: d.conflict_details,
        }));
        setLiveOverlayDetections(formatted);
      }
    } catch {}
  };

  // Explicitly Save Live Capture Frame (US-003)
  const saveCurrentLiveFrame = async () => {
    if (!canvasRef.current) return;
    const frameDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);

    try {
      const res = await fetch('/api/live/save-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          captureDataUrl: frameDataUrl,
          captureType: 'image',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Frame foto berhasil disimpan dan masuk antrean AI!', 'Frame Tersimpan');
        setActionAlert({
          type: 'success',
          message: 'Frame berhasil disimpan sebagai MediaAsset dan masuk antrean AI!',
        });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal menyimpan frame.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal menyimpan frame.' });
      }
    } catch {
      toast.error('Koneksi error saat menyimpan frame.');
      setActionAlert({ type: 'error', message: 'Koneksi error saat menyimpan frame.' });
    }
  };

  // Action: Akhiri Survei (US-004)
  const handleEndSurvey = async () => {
    setActionLoading(true);
    setActionAlert(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.info('Sesi survei resmi diakhiri. Silakan review hasil temuan sebelum mengajukan submit.', 'Sesi Diakhiri');
        setActionAlert({
          type: 'success',
          message: 'Sesi survei berhasil diakhiri. Silakan review hasil temuan sebelum melakukan submit.',
        });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal mengakhiri survei.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal mengakhiri survei.' });
      }
    } catch {
      toast.error('Koneksi error saat mengakhiri survei.');
      setActionAlert({ type: 'error', message: 'Koneksi error saat mengakhiri survei.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Submit Survei (US-006)
  const handleSubmitSurvey = async () => {
    setActionLoading(true);
    setActionAlert(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Hasil survei berhasil diajukan ke admin untuk direview.', 'Pengajuan Berhasil');
        setActionAlert({
          type: 'success',
          message: 'Hasil survei berhasil dikirim ke admin (Status: Menunggu Review).',
        });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal mengirim survei.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal mengirim survei.' });
      }
    } catch {
      toast.error('Koneksi error saat mengirim survei.');
      setActionAlert({ type: 'error', message: 'Koneksi error saat mengirim survei.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Buat Revisi (US-007)
  const handleCreateRevision = async () => {
    setActionLoading(true);
    setActionAlert(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/create-revision`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.info('Draft revisi aktif. Anda dapat mengedit media atau metadata sebelum re-submit.', 'Revisi Aktif');
        setActionAlert({
          type: 'success',
          message: 'Draft revisi aktif. Anda dapat mengedit media atau metadata sebelum re-submit.',
        });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal membuat draft revisi.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal membuat draft revisi.' });
      }
    } catch {
      toast.error('Koneksi error.');
      setActionAlert({ type: 'error', message: 'Koneksi error.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Re-submit Revisi (US-007)
  const handleResubmitSurvey = async () => {
    setActionLoading(true);
    setActionAlert(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/resubmit`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Revisi hasil survei berhasil dikirim kembali ke admin!', 'Revisi Dikirim');
        setActionAlert({
          type: 'success',
          message: 'Revisi hasil survei berhasil dikirim kembali ke admin!',
        });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal re-submit revisi.');
        setActionAlert({ type: 'error', message: data.error || 'Gagal re-submit revisi.' });
      }
    } catch {
      toast.error('Koneksi error.');
      setActionAlert({ type: 'error', message: 'Koneksi error.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Save Metadata Edit (US-005)
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          locationAddress: editAddress,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditModalOpen(false);
        toast.success('Informasi nama dan alamat survei berhasil diperbarui.', 'Metadata Tersimpan');
        setActionAlert({ type: 'success', message: 'Metadata survei berhasil diperbarui.' });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal memperbarui metadata.');
      }
    } catch {
      toast.error('Koneksi error saat menyimpan perubahan informasi.');
    }
  };

  // Action: Resolve Conflict (US-006 & Section 6.2)
  const handleResolveConflict = async (chosenClassId: string) => {
    if (!activeConflictDetection) return;
    try {
      const res = await fetch(`/api/detections/${activeConflictDetection.id}/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenClassId }),
      });
      const data = await res.json();
      if (res.ok) {
        setConflictModalOpen(false);
        setActiveConflictDetection(null);
        toast.success('Konflik kelas objek berhasil diselesaikan.', 'Konflik Tuntas');
        setActionAlert({ type: 'success', message: 'Konflik kelas berhasil diselesaikan!' });
        fetchSessionDetails();
      } else {
        toast.error(data.error || 'Gagal menyelesaikan konflik.');
      }
    } catch {
      toast.error('Koneksi error saat menyelesaikan konflik.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DetailWorkspaceSkeleton />
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Sesi Tidak Ditemukan</h2>
          <button
            onClick={() => router.push('/surveyor/sessions')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold active:scale-95 transition-all shadow-md cursor-pointer"
          >
            Kembali ke Daftar Sesi
          </button>
        </div>
      </div>
    );
  }

  const detections: DetectionItem[] = session.detections || [];
  const mediaAssets: MediaAssetItem[] = session.mediaAssets || [];

  // Group detections by class
  const classGroups: Record<string, { className: string; displayName: string; items: DetectionItem[] }> = {};
  for (const det of detections) {
    const key = det.classId;
    if (!classGroups[key]) {
      classGroups[key] = {
        className: det.className,
        displayName: det.classDefinition?.displayName || det.className,
        items: [],
      };
    }
    classGroups[key].items.push(det);
  }

  const filteredDetections =
    selectedClassFilter === 'all'
      ? detections
      : detections.filter((d) => d.classId === selectedClassFilter);

  const unresolvedConflicts = detections.filter((d) => d.hasConflict && !d.conflictResolved);
  const processingMedia = mediaAssets.filter((m) =>
    ['queued', 'uploading', 'processing'].includes(m.status)
  );
  const failedMedia = mediaAssets.filter((m) => m.status === 'failed');

  const canEditMetadata = ['berlangsung', 'selesai_menunggu_submit', 'perlu_perbaikan'].includes(session.status);
  const canUploadMedia = ['berlangsung', 'perlu_perbaikan'].includes(session.status);
  const canSubmit = session.status === 'selesai_menunggu_submit';
  const canResubmit = session.status === 'perlu_perbaikan';
  const isRejected = session.status === 'ditolak';

  const lastSubmission = session.submissions?.[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      {/* Main Workspace Header Banner */}
      <div className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{session.name}</h1>
                {/* State Badge */}
                <span
                  className={`px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider ${
                    session.status === 'berlangsung'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : session.status === 'selesai_menunggu_submit'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : session.status === 'menunggu_review'
                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                      : session.status === 'disetujui'
                      ? 'bg-teal-100 text-teal-800 border border-teal-300'
                      : session.status === 'ditolak'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {session.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Metadata Details */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 mt-2">
                {session.locationAddress && (
                  <span className="flex items-center gap-1 break-words">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    {session.locationAddress}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {new Date(session.surveyDate).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Mulai: {new Date(session.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  {session.finishedAt &&
                    ` • Selesai: ${new Date(session.finishedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </div>
            </div>

            {/* Top Lifecycle Action Buttons: Mobile responsive flex wrap */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {canEditMetadata && (
                <button
                  type="button"
                  onClick={() => setEditModalOpen(true)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  Edit Info
                </button>
              )}

              {/* Akhiri Survei (US-004) */}
              {session.status === 'berlangsung' && (
                <button
                  type="button"
                  onClick={handleEndSurvey}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Akhiri Survei
                </button>
              )}

              {/* Submit Survei (US-006) */}
              {canSubmit && (
                <button
                  type="button"
                  onClick={handleSubmitSurvey}
                  disabled={actionLoading || processingMedia.length > 0 || unresolvedConflicts.length > 0}
                  className="px-4 sm:px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit ke Admin
                </button>
              )}

              {/* Buat Revisi (US-007) */}
              {isRejected && (
                <button
                  type="button"
                  onClick={handleCreateRevision}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  Buat Revisi
                </button>
              )}

              {/* Re-submit (US-007) */}
              {canResubmit && (
                <button
                  type="button"
                  onClick={handleResubmitSurvey}
                  disabled={actionLoading || processingMedia.length > 0 || unresolvedConflicts.length > 0}
                  className="px-4 sm:px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Kirim Revisi Baru
                </button>
              )}
            </div>
          </div>

          {/* Rejection Details Banner (US-007) */}
          {isRejected && lastSubmission && (
            <div className="mt-4 p-3.5 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-rose-800 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                Sesi Survei Ditolak oleh Admin ({lastSubmission.rejectReason || 'Alasan tidak disebutkan'})
              </div>
              {lastSubmission.reviewNotes && (
                <p className="text-rose-700 mt-1 pl-6 break-words">
                  <strong>Catatan Admin:</strong> {lastSubmission.reviewNotes}
                </p>
              )}
              <p className="text-rose-600 mt-2 pl-6 font-medium">
                Klik tombol <strong>&quot;Buat Revisi&quot;</strong> di atas untuk membuka draft revisi baru. Versi sebelumnya akan tetap tersimpan dalam riwayat.
              </p>
            </div>
          )}

          {/* Action Alert Banner */}
          {actionAlert && (
            <div
              className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between gap-3 ${
                actionAlert.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {actionAlert.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="break-words">{actionAlert.message}</span>
              </div>
              <button
                onClick={() => setActionAlert(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Processing / Conflict Warnings */}
          {unresolvedConflicts.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Terdapat <strong>{unresolvedConflicts.length} konflik kelas</strong> mutually exclusive yang perlu diselesaikan sebelum submit.
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveConflictDetection(unresolvedConflicts[0]);
                  setConflictModalOpen(true);
                }}
                className="px-3 py-1.5 bg-amber-600 active:scale-95 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 shrink-0 cursor-pointer"
              >
                Selesaikan Konflik
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 mb-6 gap-3">
          <div className="flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('findings')}
              className={`pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'findings'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Temuan AI ({detections.length})
            </button>

            <button
              onClick={() => setActiveTab('media')}
              className={`pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'media'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              Media ({mediaAssets.length})
              {processingMedia.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              )}
            </button>

            {canUploadMedia && (
              <button
                onClick={() => {
                  setActiveTab('live');
                  if (!liveActive) startLiveCamera();
                }}
                className={`pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'live'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Camera className="w-4 h-4 text-emerald-600" />
                Live Mode
              </button>
            )}

            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2.5 sm:pb-3 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'history'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              Riwayat ({session.submissions?.length || 0})
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
            {canEditMetadata && mediaAssets.length > 0 && (
              <button
                type="button"
                onClick={handleRescanAllMedia}
                disabled={rescaningAll || uploading}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Scan ulang semua media"
              >
                {rescaningAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{rescaningAll ? 'Sedang Rescan...' : 'Rescan Semua'}</span>
              </button>
            )}

            {canUploadMedia && (
              <label className="cursor-pointer px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all shrink-0">
                <Plus className="w-3.5 h-3.5" />
                <span>Upload Gambar/Video</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,video/mp4"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading || rescaningAll}
                />
              </label>
            )}
          </div>
        </div>


        {/* Upload Progress Indicator */}
        {uploadProgress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 shrink-0" />
            <span className="font-medium">{uploadProgress}</span>
          </div>
        )}

        {/* TAB 1: FINDINGS GROUPED BY CLASS */}
        {activeTab === 'findings' && (
          <div className="space-y-6">
            {/* Class Filter Badges */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedClassFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedClassFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Semua Kelas ({detections.length})
              </button>
              {Object.entries(classGroups).map(([classId, group]) => (
                <button
                  key={classId}
                  onClick={() => setSelectedClassFilter(classId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    selectedClassFilter === classId
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{group.displayName}</span>
                  <span className="px-1.5 py-0.2 bg-black/10 rounded-full text-[10px]">
                    {group.items.length}
                  </span>
                </button>
              ))}
            </div>

            {filteredDetections.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
                <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <h3 className="font-semibold text-slate-700 text-sm">Belum Ada Objek Terdeteksi</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Upload media gambar/video atau gunakan kamera live untuk mendeteksi kondisi infrastruktur dengan AI.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDetections.map((det) => {
                  let parsedBbox = { x: 0, y: 0, width: 0, height: 0 };
                  try {
                    parsedBbox = JSON.parse(det.bbox);
                  } catch {}

                  const overlayItem: OverlayDetection = {
                    id: det.id,
                    className: det.className,
                    displayName: det.classDefinition?.displayName || det.className,
                    bbox: parsedBbox,
                    condition: det.condition,
                    feasibility: det.feasibility,
                    hasConflict: det.hasConflict && !det.conflictResolved,
                    conflictDetails: det.conflictDetails ? JSON.parse(det.conflictDetails) : undefined,
                  };

                  return (
                    <div
                      key={det.id}
                      onClick={() => setInspectingMediaId(det.mediaAssetId)}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-lg hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                    >
                      {/* Media Image with Box Overlay */}
                      <div className="relative h-48 bg-slate-950 overflow-hidden">
                        {det.mediaAsset?.fileUrl ? (
                          <MediaBoxOverlay
                            mediaUrl={det.mediaAsset.fileUrl}
                            mediaType={det.mediaAsset.fileType as any}
                            detections={[overlayItem]}
                            className="w-full h-48"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                            Media tidak tersedia
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="px-3 py-1.5 bg-blue-600/90 backdrop-blur-xs text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg">
                            <Eye className="w-3.5 h-3.5" />
                            Inspeksi & Edit
                          </span>
                        </div>
                      </div>

                      {/* Info Content */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                            {det.classDefinition?.displayName || det.className}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              det.feasibility === 'tidak_layak'
                                ? 'bg-rose-100 text-rose-800'
                                : det.feasibility === 'cukup_layak'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {det.feasibility.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2">{det.condition}</p>

                        {det.hasConflict && !det.conflictResolved && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              Konflik Kelas Terdeteksi
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveConflictDetection(det);
                                setConflictModalOpen(true);
                              }}
                              className="text-blue-600 font-bold hover:underline cursor-pointer"
                            >
                              Selesaikan
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
        )}

        {/* TAB 2: MEDIA ASSETS */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            {mediaAssets.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
                <UploadCloud className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <h3 className="font-semibold text-slate-700 text-sm">Belum Ada File Media</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                  Upload file foto (JPG, PNG) atau video (MP4) untuk sesi survei ini.
                </p>
                {canUploadMedia && (
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 shadow-sm">
                    <Plus className="w-4 h-4" />
                    Pilih File Media
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,video/mp4"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mediaAssets.map((media) => {
                  const mediaDetectionsCount = (session?.detections || []).filter(
                    (d: any) => d.mediaAssetId === media.id && !d.isDeleted
                  ).length;

                  return (
                    <div
                      key={media.id}
                      onClick={() => setInspectingMediaId(media.id)}
                      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-lg hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-semibold text-slate-800 text-xs truncate max-w-[200px] group-hover:text-blue-600 transition-colors">
                            {media.fileName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              media.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : media.status === 'processing'
                                ? 'bg-blue-100 text-blue-800 animate-pulse'
                                : media.status === 'failed'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {media.status}
                          </span>
                        </div>

                        <div className="relative h-36 bg-slate-900 rounded-xl overflow-hidden mb-3">
                          {media.fileType === 'video' ? (
                            <video src={media.fileUrl} className="w-full h-full object-cover" />
                          ) : (
                            <img src={media.fileUrl} alt={media.fileName} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-3 py-1 bg-blue-600/90 backdrop-blur-xs text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow">
                              <Eye className="w-3.5 h-3.5" />
                              Lihat Hasil AI
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                          <span className="font-medium text-slate-700">
                            {media.status === 'completed' ? (
                              <strong className="text-blue-600">{mediaDetectionsCount} Objek Terdeteksi</strong>
                            ) : media.status === 'processing' ? (
                              <span className="text-blue-500 animate-pulse">Sedang memproses AI...</span>
                            ) : media.status === 'failed' ? (
                              <span className="text-rose-500">Gagal diproses</span>
                            ) : (
                              <span>Menunggu AI</span>
                            )}
                          </span>
                          <span className="text-slate-400">Klik untuk detail</span>
                        </div>

                        {media.status === 'failed' && media.errorMessage && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 mb-2">
                            {media.errorMessage}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>{media.fileType.toUpperCase()}</span>

                        <div className="flex items-center gap-1.5">
                          {canEditMetadata && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRescanSingleMedia(media.id, media.fileName);
                              }}
                              title="Scan ulang media"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {media.status === 'failed' && canEditMetadata && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryMedia(media.id);
                              }}
                              title="Retry processing"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEditMetadata && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMedia(media.id);
                              }}
                              title="Hapus media permanen"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LIVE CAMERA MODE (US-003) */}
        {activeTab === 'live' && canUploadMedia && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-600 shrink-0" />
                  Mode Deteksi Kamera Live (Near-Realtime)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI mengambil sampel frame berkala untuk overlay bounding box. Tekan tombol <strong>Simpan Frame</strong> untuk memasukkannya ke survei.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {liveActive ? (
                  <button
                    type="button"
                    onClick={stopLiveCamera}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Matikan Kamera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startLiveCamera}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Nyalakan Kamera
                  </button>
                )}
              </div>
            </div>

            {/* Video Viewport & Canvas Overlay */}
            <div className="relative w-full max-w-2xl mx-auto h-[260px] sm:h-[340px] md:h-[400px] bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-contain ${liveActive ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!liveActive && (
                <div className="text-center text-slate-500 p-6">
                  <Camera className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-medium">Kamera sedang nonaktif.</p>
                  <button
                    onClick={startLiveCamera}
                    className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                  >
                    Mulai Kamera Live
                  </button>
                </div>
              )}

              {/* Bounding Box Overlays on Live Video */}
              {liveActive && (
                <div className="absolute inset-0 pointer-events-none">
                  {liveOverlayDetections.map((det) => (
                    <div
                      key={det.id}
                      style={{
                        left: `${det.bbox.x * 100}%`,
                        top: `${det.bbox.y * 100}%`,
                        width: `${det.bbox.width * 100}%`,
                        height: `${det.bbox.height * 100}%`,
                      }}
                      className="absolute border-2 border-emerald-400 bg-emerald-500/20 rounded-xs transition-all"
                    >
                      <div className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-emerald-600 text-white text-[9px] sm:text-[10px] font-bold whitespace-nowrap shadow-xs">
                        {det.className} ({det.feasibility.replace('_', ' ')})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Explicit Save Actions */}
            {liveActive && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={saveCurrentLiveFrame}
                  className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Simpan Frame Ini ke Sesi Survei
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: VERSION HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600 shrink-0" />
              Riwayat SubmissionVersion (Snapshot Immutable)
            </h3>
            <p className="text-xs text-slate-500">
              Setiap kali survei diajukan, sistem membuat snapshot data yang tidak dapat diubah (immutable).
            </p>

            {(!session.submissions || session.submissions.length === 0) ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Belum ada SubmissionVersion yang dibuat (Sesi belum pernah dikirim ke admin).
              </div>
            ) : (
              <div className="space-y-3">
                {session.submissions.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">
                          Versi {sub.versionNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            sub.status === 'disetujui'
                              ? 'bg-teal-100 text-teal-800'
                              : sub.status === 'ditolak'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {sub.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Disubmit pada: {new Date(sub.submittedAt).toLocaleString('id-ID')}
                        {sub.reviewedAt && ` • Direview pada: ${new Date(sub.reviewedAt).toLocaleString('id-ID')}`}
                      </div>
                      {sub.rejectReason && (
                        <div className="text-xs text-rose-700 mt-1 font-medium break-words">
                          Alasan Reject: {sub.rejectReason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: CONFLICT RESOLUTION (US-006 & Section 6.2) */}
      {conflictModalOpen && activeConflictDetection && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                Selesaikan Konflik Kelas
              </h3>
              <button onClick={() => setConflictModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              AI mendeteksi dua kelas mutually exclusive pada area objek yang sama. Pilih kelas yang paling sesuai:
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Pilih Kelas yang Benar:</label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {availableClasses.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => handleResolveConflict(cls.id)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 active:scale-95 transition-all group flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-800 group-hover:text-blue-600 truncate">
                        {cls.displayName || cls.name}
                      </div>
                      <div className="text-slate-500 text-[11px] line-clamp-1">{cls.visualDescription}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT METADATA (US-005) */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form onSubmit={handleSaveMetadata} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Edit Informasi Sesi Survei</h3>
              <button type="button" onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Survei</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat / Catatan Lokasi</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}


      {/* MODAL: MEDIA INSPECTION & SURVEYOR CORRECTION */}
      <MediaInspectionModal
        isOpen={Boolean(inspectingMediaId)}
        onClose={() => setInspectingMediaId(null)}
        mediaAsset={
          session?.mediaAssets?.find((m: any) => m.id === inspectingMediaId) || null
        }
        session={session}
        detections={
          (session?.detections || []).filter(
            (d: any) => d.mediaAssetId === inspectingMediaId && !d.isDeleted
          )
        }
        activeClasses={availableClasses}
        canEdit={canEditMetadata}
        onSaved={fetchSessionDetails}
      />
    </div>
  );
}
