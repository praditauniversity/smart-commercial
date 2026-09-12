'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MediaBoxOverlay, { OverlayDetection } from '@/components/MediaBoxOverlay';
import MediaInspectionModal from '@/components/MediaInspectionModal';
import { useToast } from '@/components/ToastProvider';
import { DetailWorkspaceSkeleton } from '@/components/SkeletonLoaders';
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Layers,
  Edit2,
  FileText,
  ChevronLeft,
  Loader2,
  X,
  User as UserIcon,
  Eye,
  FileImage,
  ArrowRight,
} from 'lucide-react';

export default function AdminReviewDetailPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;

  const [submission, setSubmission] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [inspectingMediaId, setInspectingMediaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detections' | 'media'>('detections');

  // Modals
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Kualitas foto/video buram / tidak jelas');
  const [rejectNotes, setRejectNotes] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/admin/reviews/${submissionId}`);
      const data = await res.json();
      if (data.success && data.submission) {
        setSubmission(data.submission);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/admin/classes');
      const data = await res.json();
      if (data.classes) setClasses(data.classes);
    } catch {}
  };

  useEffect(() => {
    fetchDetail();
    fetchClasses();
  }, [submissionId]);

  // Handle Approve
  const handleApprove = async () => {
    setActionLoading(true);
    setAlertMsg(null);
    try {
      const res = await fetch(`/api/admin/reviews/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approveNotes }),
      });
      const data = await res.json();
      if (res.ok) {
        setApproveModalOpen(false);
        toast.success('Sesi survei resmi disetujui dan masuk ke agregat pemantauan wilayah!', 'Survei Disetujui');
        setAlertMsg({ type: 'success', message: 'Sesi survei resmi disetujui!' });
        fetchDetail();
      } else {
        toast.error(data.error || 'Gagal menyetujui survei.');
      }
    } catch {
      toast.error('Koneksi error saat menyetujui survei.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!rejectReason) {
      toast.warning('Pilih alasan penolakan wajib dipilih.');
      return;
    }
    setActionLoading(true);
    setAlertMsg(null);
    try {
      const res = await fetch(`/api/admin/reviews/${submissionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectReason, reviewNotes: rejectNotes }),
      });
      const data = await res.json();
      if (res.ok) {
        setRejectModalOpen(false);
        toast.info('Survei ditolak dan catatan perbaikan telah dikirim ke surveyor.', 'Survei Dikembalikan');
        setAlertMsg({ type: 'success', message: 'Survei ditolak dan catatan telah dikirim ke surveyor.' });
        fetchDetail();
      } else {
        toast.error(data.error || 'Gagal menolak survei.');
      }
    } catch {
      toast.error('Koneksi error saat menolak survei.');
    } finally {
      setActionLoading(false);
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

  if (!submission) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Submission Tidak Ditemukan</h2>
          <button
            onClick={() => router.push('/admin/reviews')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold active:scale-95 transition-all shadow-md cursor-pointer"
          >
            Kembali ke Antrean Review
          </button>
        </div>
      </div>
    );
  }

  const snapshot = submission.parsedSnapshot || {};
  const detections: any[] = snapshot.detections || [];
  const isPendingReview = submission.status === 'menunggu_review';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      {/* Header Banner */}
      <div className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <button
            onClick={() => router.push('/admin/reviews')}
            className="text-xs text-blue-600 font-semibold flex items-center gap-1 mb-3 hover:underline cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Kembali ke Antrean Review
          </button>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{submission.session?.name}</h1>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  Snapshot: v{submission.versionNumber}
                </span>
                <span
                  className={`px-2 sm:px-2.5 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider ${
                    submission.status === 'disetujui'
                      ? 'bg-teal-100 text-teal-800'
                      : submission.status === 'ditolak'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {submission.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 mt-2">
                {submission.session?.locationAddress && (
                  <span className="flex items-center gap-1 break-words">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    {submission.session.locationAddress}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Surveyor: <strong>{submission.session?.surveyor?.name}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Disubmit: {new Date(submission.submittedAt).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Approve / Reject Controls: Responsive layout */}
            {isPendingReview && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Tolak (Reject)
                </button>
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(true)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Setujui (Approve)
                </button>
              </div>
            )}
          </div>

          {/* Warning banner if session is currently being revised */}
          {submission.session?.status === 'perlu_perbaikan' && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Sesi survei ini sedang dalam proses perbaikan/revisi oleh surveyor. Tombol review akan aktif kembali setelah surveyor mengirim ulang hasil revisi (re-submit).
              </span>
            </div>
          )}

          {alertMsg && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{alertMsg.message}</span>
            </div>
          )}
        </div>
      </div>


      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('detections')}
            className={`pb-3 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'detections'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Temuan Deteksi AI ({detections.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`pb-3 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'media'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileImage className="w-4 h-4" />
            Semua Media & File Sesi ({snapshot.mediaAssets?.length || 0})
          </button>
        </div>

        {/* Findings Inspection Section */}
        {activeTab === 'detections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                Daftar Temuan Deteksi ({detections.length})
              </h2>
              <p className="text-xs text-slate-500">
                Klik pada kartu untuk melihat data temuan, foto/video resolusi asli, dan titik peta lokasi.
              </p>
            </div>

            {detections.length === 0 ? (
              <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
                <Layers className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700 text-sm">Tidak ada temuan deteksi pada survei ini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {detections.map((det) => {
                  const mediaObj = snapshot.mediaAssets?.find((m: any) => m.id === det.mediaAssetId);
                  const overlayItem: OverlayDetection = {
                    id: det.id,
                    className: det.className,
                    displayName: det.displayName || det.className,
                    bbox: det.bbox || { x: 0, y: 0, width: 0, height: 0 },
                    condition: det.condition,
                    feasibility: det.feasibility,
                    hasConflict: det.hasConflict,
                  };

                  return (
                    <div
                      key={det.id}
                      onClick={() => setInspectingMediaId(det.mediaAssetId)}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                    >
                      <div className="relative h-48 bg-slate-950">
                        {mediaObj?.fileUrl ? (
                          <MediaBoxOverlay
                            mediaUrl={mediaObj.fileUrl}
                            mediaType={mediaObj.fileType as any}
                            detections={[overlayItem]}
                            className="w-full h-48 pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                            Gambar tidak tersedia
                          </div>
                        )}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Data & Peta
                        </div>
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                            {det.displayName || det.className}
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

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-rose-500" />
                            Lokasi Terpetakan
                          </span>
                          <span className="text-blue-600 font-semibold flex items-center gap-1 group-hover:underline">
                            <Eye className="w-3.5 h-3.5" />
                            Lihat Data
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Media & Files Section */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileImage className="w-5 h-5 text-blue-600" />
                Daftar Media & File Sesi ({snapshot.mediaAssets?.length || 0})
              </h2>
              <p className="text-xs text-slate-500">
                Klik kartu foto atau video untuk melihat data detail dan titik peta lokasi.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(snapshot.mediaAssets || []).map((m: any) => {
                const detCount = detections.filter((d: any) => d.mediaAssetId === m.id).length;
                return (
                  <div
                    key={m.id}
                    onClick={() => setInspectingMediaId(m.id)}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                  >
                    <div className="relative h-48 bg-slate-950 flex items-center justify-center">
                      {m.fileUrl ? (
                        m.fileType === 'video' ? (
                          <video src={m.fileUrl} className="w-full h-full object-cover" />
                        ) : (
                          <img src={m.fileUrl} alt={m.fileName} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="text-slate-500 text-xs">File tidak tersedia</div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-xs">
                        <Eye className="w-3.5 h-3.5" />
                        Lihat Data & Peta
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-900 truncate" title={m.fileName}>
                          {m.fileName}
                        </h4>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md">
                          {detCount} Deteksi
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span className="uppercase text-[10px] font-semibold">{m.fileType}</span>
                        <span className="text-blue-600 font-semibold flex items-center gap-1 group-hover:underline">
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Data
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Histori Tindakan & Jejak Audit (Audit Trail) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Histori Tindakan & Jejak Perubahan Data (Audit Trail)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Rekaman kronologis seluruh aktivitas penolakan admin, revisi surveyor, perubahan foto/titik peta, dan re-submit.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">
              {auditLogs.length} Catatan Jejak
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
              <p className="text-xs font-medium text-slate-600">Belum ada riwayat aktivitas yang tercatat pada sesi ini.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => {
                let parsedChanges: any = null;
                try {
                  parsedChanges = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
                } catch {}

                const getActionBadge = (action: string) => {
                  switch (action) {
                    case 'ADMIN_REJECT_SURVEY':
                      return <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-medium text-xs">Penolakan Admin</span>;
                    case 'ADMIN_APPROVE_SURVEY':
                      return <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-medium text-xs">Persetujuan Admin</span>;
                    case 'SURVEYOR_EDIT_DETECTION':
                      return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-medium text-xs">Edit Temuan</span>;
                    case 'ADMIN_CORRECT_DETECTION':
                      return <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md font-medium text-xs">Koreksi Admin</span>;
                    case 'SURVEYOR_START_REVISION':
                      return <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md font-medium text-xs">Mulai Revisi</span>;
                    case 'SURVEYOR_RESUBMIT_REVISION':
                      return <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md font-medium text-xs">Revisi Dikirim Kembali</span>;
                    case 'SURVEYOR_SUBMIT_SURVEY':
                      return <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md font-medium text-xs">Pengajuan Survei</span>;
                    case 'SURVEYOR_UPLOAD_MEDIA':
                      return <span className="px-2.5 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-md font-medium text-xs">Upload Media</span>;
                    case 'SURVEYOR_DELETE_MEDIA':
                      return <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-medium text-xs">Hapus Media</span>;
                    case 'SURVEYOR_DELETE_DETECTION':
                      return <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-medium text-xs">Hapus Temuan</span>;
                    case 'UPDATE_SESSION_METADATA':
                      return <span className="px-2.5 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs">Perubahan Info Sesi</span>;
                    case 'RESOLVE_CONFLICT':
                      return <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-md font-medium text-xs">Resolusi Konflik</span>;
                    default:
                      return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-xs">{action}</span>;
                  }
                };

                // Compute exact differences to avoid rendering unchanged fields
                const isClassDiff = Boolean(
                  parsedChanges?.updated?.className &&
                  parsedChanges.previous?.className &&
                  parsedChanges.updated.className !== parsedChanges.previous.className
                );

                const isConditionDiff = Boolean(
                  parsedChanges?.updated?.condition &&
                  parsedChanges.updated.condition.trim() !== (parsedChanges.previous?.condition || '').trim()
                );

                const isFeasibilityDiff = Boolean(
                  parsedChanges?.updated?.feasibility &&
                  parsedChanges.previous?.feasibility &&
                  parsedChanges.updated.feasibility !== parsedChanges.previous.feasibility
                );

                const isLocationDiff = Boolean(
                  parsedChanges?.updated?.locationCoordinates &&
                  JSON.stringify(parsedChanges.updated.locationCoordinates) !== JSON.stringify(parsedChanges.previous?.locationCoordinates)
                );

                const hasFieldDiffs = isClassDiff || isConditionDiff || isFeasibilityDiff || isLocationDiff;

                return (
                  <div key={log.id} className="py-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionBadge(log.action)}
                        <span className="text-slate-800 font-bold">
                          {log.actor?.name || 'Sistem / Admin'}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          ({log.actor?.role === 'admin' ? 'Admin' : 'Surveyor Lapangan'} • {log.actor?.email || '-'})
                        </span>
                      </div>
                      <span className="text-slate-500 text-[11px] font-mono">
                        {new Date(log.createdAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Change Details */}
                    {parsedChanges && (
                      <div className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl text-slate-700 text-xs space-y-2">
                        {parsedChanges.actionDescription && (
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                            {parsedChanges.actionDescription}
                          </div>
                        )}

                        {parsedChanges.rejectReason && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              Alasan Penolakan: {parsedChanges.rejectReason}
                            </div>
                            {parsedChanges.reviewNotes && (
                              <div className="text-[11px] text-rose-800 pl-5.5">
                                Catatan Admin: &quot;{parsedChanges.reviewNotes}&quot;
                              </div>
                            )}
                          </div>
                        )}

                        {parsedChanges.notes && !parsedChanges.rejectReason && (
                          <div className="text-slate-700">
                            <strong>Catatan:</strong> {parsedChanges.notes}
                          </div>
                        )}

                        {/* List only the fields that actually changed */}
                        {hasFieldDiffs && (
                          <div className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-2 mt-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Rincian Data yang Diperbarui:
                            </div>

                            {isClassDiff && (
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-500 min-w-[70px]">Kelas:</span>
                                <span className="line-through text-slate-400">{parsedChanges.previous.className}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="font-bold text-slate-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  {parsedChanges.updated.className}
                                </span>
                              </div>
                            )}

                            {isConditionDiff && (
                              <div className="flex flex-wrap items-start gap-2 text-xs">
                                <span className="font-semibold text-slate-500 min-w-[70px] shrink-0 pt-0.5">Kondisi:</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="line-through text-slate-400 text-[11px]">
                                    &quot;{parsedChanges.previous?.condition || '-'}&quot;
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    &quot;{parsedChanges.updated.condition}&quot;
                                  </span>
                                </div>
                              </div>
                            )}

                            {isFeasibilityDiff && (
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-500 min-w-[70px]">Kelayakan:</span>
                                <span className="line-through text-slate-400">{parsedChanges.previous.feasibility}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="font-bold text-slate-900 uppercase bg-slate-100 px-2 py-0.5 rounded">
                                  {parsedChanges.updated.feasibility}
                                </span>
                              </div>
                            )}

                            {isLocationDiff && (
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-500 min-w-[70px]">Titik Peta:</span>
                                <span className="text-slate-400 text-[11px]">
                                  {parsedChanges.previous?.locationCoordinates
                                    ? `[${parsedChanges.previous.locationCoordinates[0].toFixed(5)}, ${parsedChanges.previous.locationCoordinates[1].toFixed(5)}]`
                                    : 'Titik Posisi Awal'}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="font-mono text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  [{parsedChanges.updated.locationCoordinates[0].toFixed(5)}, {parsedChanges.updated.locationCoordinates[1].toFixed(5)}]
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* APPROVE MODAL */}
      {approveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Setujui Hasil Survei
              </h3>
              <button onClick={() => setApproveModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Setelah disetujui, hasil survei ini akan menjadi data final dan resmi dimasukkan ke dalam dashboard agregat pemantauan kawasan.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Persetujuan (Opsional)</label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Tambahkan catatan untuk surveyor..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApproveModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 transition-all"
              >
                {actionLoading ? 'Memproses...' : 'Konfirmasi Setujui'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL (US-008 with mandatory reject reasons) */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                Tolak Hasil Survei & Minta Perbaikan
              </h3>
              <button onClick={() => setRejectModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Penolakan <span className="text-rose-500">*</span>
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 font-medium"
              >
                <option value="Kualitas foto/video buram / tidak jelas">Kualitas foto/video buram / tidak jelas</option>
                <option value="Deteksi objek tidak akurat / salah kelas">Deteksi objek tidak akurat / salah kelas</option>
                <option value="Lokasi survei tidak sesuai atau belum lengkap">Lokasi survei tidak sesuai atau belum lengkap</option>
                <option value="Terdapat media duplikat yang tidak valid">Terdapat media duplikat yang tidak valid</option>
                <option value="Data temuan tidak memenuhi kriteria kelayakan kawasan">Data temuan tidak memenuhi kriteria kelayakan kawasan</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Detail Perbaikan untuk Surveyor</label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Jelaskan detail perbaikan yang perlu dilakukan surveyor..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 transition-all"
              >
                {actionLoading ? 'Memproses...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL READ-ONLY MEDIA & LOCATION INSPECTION MODAL FOR ADMIN */}
      <MediaInspectionModal
        isOpen={Boolean(inspectingMediaId)}
        onClose={() => setInspectingMediaId(null)}
        mediaAsset={
          submission?.session?.mediaAssets?.find((m: any) => m.id === inspectingMediaId) ||
          snapshot?.mediaAssets?.find((m: any) => m.id === inspectingMediaId) ||
          null
        }
        session={submission?.session || null}
        detections={
          (submission?.session?.detections || snapshot?.detections || []).filter(
            (d: any) => d.mediaAssetId === inspectingMediaId && !d.isDeleted
          )
        }
        activeClasses={classes}
        canEdit={false}
        onSaved={fetchDetail}
      />
    </div>
  );
}
