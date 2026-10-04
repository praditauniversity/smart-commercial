'use client';

import React, { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MediaBoxOverlay, { OverlayDetection } from '@/components/MediaBoxOverlay';
import MediaInspectionModal from '@/components/MediaInspectionModal';
import { Sam3Chips, getSam3Result } from '@/components/Sam3Result';
import AuditTimeline from '@/components/AuditTimeline';
import ReviewFindings, { type LiveFindings } from '@/components/ReviewFindings';
import Pagination from '@/components/Pagination';
import { FINDINGS_PAGE_SIZE, paginateTwo } from '@/lib/pagination';
import { useToast } from '@/components/ToastProvider';
import { DetailWorkspaceSkeleton } from '@/components/SkeletonLoaders';
import { feasibilityText, isFeasibilityRated } from '@/lib/feasibility';
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Layers,
  Edit2,
  ChevronLeft,
  Loader2,
  X,
  User as UserIcon,
  Eye,
  FileImage,
} from 'lucide-react';

export default function AdminReviewDetailPage() {
  const toast = useToast();
  const params = useParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;
  const reviewBase = usePathname().startsWith('/supervisor') ? '/supervisor/reviews' : '/admin/reviews';

  const [submission, setSubmission] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [liveFindings, setLiveFindings] = useState<LiveFindings | null>(null);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [inspectingMediaId, setInspectingMediaId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detections' | 'media'>('detections');
  const [findingsPage, setFindingsPage] = useState(1);

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
        setLiveFindings(data.liveFindings || null);
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
      <div className="min-h-screen bg-dashboard-bg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DetailWorkspaceSkeleton />
        </main>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-dashboard-bg flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">Submission Tidak Ditemukan</h2>
          <button
            onClick={() => router.push(reviewBase)}
            className="px-4 py-2 bg-brand-green hover:bg-brand-green/90 text-white rounded-md text-sm font-medium active:scale-95 transition-all shadow-sm cursor-pointer"
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

  // SAM3 media get ONE card per photo/video (class pills + counts); VLM findings keep one card per object.
  // The snapshot is frozen at submit time, so the SAM3 result (segments) comes from the live session media.
  const sam3ByMediaId = new Map<string, any>();
  for (const m of submission.session?.mediaAssets || []) {
    const r = getSam3Result(m);
    if (r) sam3ByMediaId.set(m.id, r);
  }
  const vlmDetections = detections.filter((d: any) => !sam3ByMediaId.has(d.mediaAssetId));
  const sam3Groups = Array.from(sam3ByMediaId.entries())
    .map(([mediaId, result]) => ({
      mediaId,
      result,
      media: snapshot.mediaAssets?.find((m: any) => m.id === mediaId) || submission.session?.mediaAssets?.find((m: any) => m.id === mediaId),
      dets: detections.filter((d: any) => d.mediaAssetId === mediaId),
    }))
    .filter((g) => g.dets.length > 0);

  const findingsPaged = paginateTwo(sam3Groups, vlmDetections, findingsPage, FINDINGS_PAGE_SIZE);

  return (
    <div className="min-h-screen bg-dashboard-bg flex flex-col pb-24 sm:pb-16">
      <Navbar />

      {/* Header Banner */}
      <div className="bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <button
            onClick={() => router.push('/admin/reviews')}
            className="text-xs text-zinc-500 font-medium flex items-center gap-1 mb-3 hover:text-zinc-900 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Kembali ke Antrean Review
          </button>

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 break-words">{submission.session?.name}</h1>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                  Snapshot: v{submission.versionNumber}
                </span>
                <span
                  className={`px-2 sm:px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-medium uppercase tracking-wider ${
                    submission.status === 'disetujui'
                      ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                      : submission.status === 'ditolak'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-brand-orange/10 text-orange-700 border border-brand-orange/30'
                  }`}
                >
                  {submission.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-zinc-500 mt-2">
                {submission.session?.locationAddress && (
                  <span className="flex items-center gap-1 break-words">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    {submission.session.locationAddress}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  Surveyor: <strong>{submission.session?.surveyor?.name}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 active:scale-95 text-sm font-medium shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Tolak (Reject)
                </button>
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(true)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-md bg-brand-green hover:bg-brand-green/90 active:scale-95 text-white text-sm font-medium shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
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
            <div className="mt-4 p-3 bg-brand-green/10 border border-brand-green/20 text-brand-green text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
              <span>{alertMsg.message}</span>
            </div>
          )}
        </div>
      </div>


      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {liveFindings && <ReviewFindings findings={liveFindings} />}

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-200 gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('detections')}
            className={`pb-3 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'detections'
                ? 'border-b-2 border-brand-green text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900'
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
                ? 'border-b-2 border-brand-green text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900'
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
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-zinc-400" />
                Daftar Temuan Deteksi ({detections.length})
              </h2>
              <p className="text-xs text-zinc-500">
                Klik pada kartu untuk melihat data temuan, foto/video resolusi asli, dan titik peta lokasi.
              </p>
            </div>

            {detections.length === 0 ? (
              <div className="p-12 bg-white rounded-xl border border-zinc-200 shadow-sm text-center text-zinc-500">
                <Layers className="w-10 h-10 mx-auto text-zinc-300 mb-2" />
                <p className="font-medium text-zinc-900 text-sm">Tidak ada temuan deteksi pada survei ini.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {findingsPaged.first.map(({ mediaId, result, media, dets }) => {
                  const worst = dets.some((d: any) => d.feasibility === 'tidak_layak')
                    ? 'tidak_layak'
                    : dets.some((d: any) => d.feasibility === 'cukup_layak')
                    ? 'cukup_layak'
                    : 'layak';
                  return (
                    <div
                      key={mediaId}
                      onClick={() => setInspectingMediaId(mediaId)}
                      className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-zinc-300 transition-all flex flex-col justify-between cursor-pointer group"
                    >
                      <div className="relative h-48 bg-zinc-950">
                        {media?.fileType === 'video' ? (
                          <video src={result.url} muted className="w-full h-48 object-contain" />
                        ) : (
                          <img src={result.url} alt={media?.fileName || ''} className="w-full h-48 object-contain" />
                        )}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Data & Peta
                        </div>
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm text-zinc-900 group-hover:text-brand-green transition-colors truncate">
                            {media?.fileName || 'Media'}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider shrink-0 ${
                              worst === 'tidak_layak'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : worst === 'cukup_layak'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                            }`}
                          >
                            {worst.replace('_', ' ')}
                          </span>
                        </div>
                        <Sam3Chips result={result} />
                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                            {dets.length} temuan · Lokasi Terpetakan
                          </span>
                          <span className="text-zinc-900 font-medium flex items-center gap-1 group-hover:text-brand-green group-hover:underline">
                            <Eye className="w-3.5 h-3.5" />
                            Lihat Data
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {findingsPaged.second.map((det: any) => {
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
                      className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-zinc-300 transition-all flex flex-col justify-between cursor-pointer group"
                    >
                      <div className="relative h-48 bg-zinc-950">
                        {mediaObj?.fileUrl ? (
                          <MediaBoxOverlay
                            mediaUrl={mediaObj.fileUrl}
                            mediaType={mediaObj.fileType as any}
                            detections={[overlayItem]}
                            className="w-full h-48 pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                            Gambar tidak tersedia
                          </div>
                        )}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Data & Peta
                        </div>
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-sm text-zinc-900 group-hover:text-brand-green transition-colors">
                            {det.displayName || det.className}
                          </h4>
                          {isFeasibilityRated(det.feasibility) && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                                det.feasibility === 'tidak_layak'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : det.feasibility === 'cukup_layak'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                              }`}
                            >
                              {feasibilityText(det.feasibility)}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-500 line-clamp-2">{det.condition}</p>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                            Lokasi Terpetakan
                          </span>
                          <span className="text-zinc-900 font-medium flex items-center gap-1 group-hover:text-brand-green group-hover:underline">
                            <Eye className="w-3.5 h-3.5" />
                            Lihat Data
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination
                page={findingsPaged.page}
                pageSize={FINDINGS_PAGE_SIZE}
                total={findingsPaged.total}
                onPageChange={setFindingsPage}
                itemLabel="kartu temuan"
              />
              </>
            )}
          </div>
        )}

        {/* Media & Files Section */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 flex items-center gap-2">
                <FileImage className="w-5 h-5 text-zinc-400" />
                Daftar Media & File Sesi ({snapshot.mediaAssets?.length || 0})
              </h2>
              <p className="text-xs text-zinc-500">
                Klik kartu foto atau video untuk melihat data detail dan titik peta lokasi.
              </p>
            </div>

            <div className="grid max-h-[80vh] grid-cols-1 gap-6 overflow-y-auto p-1 md:grid-cols-2 lg:grid-cols-3">
              {(snapshot.mediaAssets || []).map((m: any) => {
                const detCount = detections.filter((d: any) => d.mediaAssetId === m.id).length;
                return (
                  <div
                    key={m.id}
                    onClick={() => setInspectingMediaId(m.id)}
                    className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-zinc-300 transition-all flex flex-col justify-between cursor-pointer group"
                  >
                    <div className="relative h-48 bg-zinc-950 flex items-center justify-center">
                      {m.fileUrl ? (
                        m.fileType === 'video' ? (
                          <video src={m.fileUrl} className="w-full h-full object-cover" />
                        ) : (
                          <img src={m.fileUrl} alt={m.fileName} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="text-zinc-500 text-xs">File tidak tersedia</div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                        <Eye className="w-3.5 h-3.5" />
                        Lihat Data & Peta
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-xs text-zinc-900 truncate" title={m.fileName}>
                          {m.fileName}
                        </h4>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 text-[10px] font-medium rounded-md">
                          {detCount} Deteksi
                        </span>
                      </div>
                      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                        <span className="uppercase text-[10px] font-semibold">{m.fileType}</span>
                        <span className="text-zinc-900 font-medium flex items-center gap-1 group-hover:text-brand-green group-hover:underline">
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

        {/* Riwayat aktivitas / audit trail */}
        <AuditTimeline logs={auditLogs} />
      </main>

      {/* APPROVE MODAL */}
      {approveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-zinc-900 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-brand-green shrink-0" />
                Setujui Hasil Survei
              </h3>
              <button onClick={() => setApproveModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Setelah disetujui, hasil survei ini akan menjadi data final dan resmi dimasukkan ke dalam dashboard agregat pemantauan kawasan.
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-900 mb-1">Catatan Persetujuan (Opsional)</label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Tambahkan catatan untuk surveyor..."
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-xs focus:ring-2 focus:ring-brand-green/40 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setApproveModalOpen(false)}
                className="px-4 py-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 text-sm font-medium shadow-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-5 py-2 rounded-md bg-brand-green hover:bg-brand-green/90 active:scale-95 text-white text-sm font-medium shadow-sm cursor-pointer disabled:opacity-50 transition-all"
              >
                {actionLoading ? 'Memproses...' : 'Konfirmasi Setujui'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL (US-007 with mandatory reject reasons) */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-semibold text-zinc-900 text-base flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                Tolak Hasil Survei & Minta Perbaikan
              </h3>
              <button onClick={() => setRejectModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-900 mb-1">
                Alasan Penolakan <span className="text-rose-500">*</span>
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-brand-green/40 focus:outline-none bg-zinc-50 font-medium"
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
              <label className="block text-xs font-medium text-zinc-900 mb-1">Catatan Detail Perbaikan untuk Surveyor</label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Jelaskan detail perbaikan yang perlu dilakukan surveyor..."
                className="w-full px-3 py-2 border border-zinc-200 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-brand-green/40 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 text-sm font-medium shadow-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoading}
                className="px-5 py-2 rounded-md bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-sm font-medium shadow-sm cursor-pointer disabled:opacity-50 transition-all"
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
        sam3Result={getSam3Result(submission?.session?.mediaAssets?.find((m: any) => m.id === inspectingMediaId))}
      />
    </div>
  );
}
