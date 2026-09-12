'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CardSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import {
  CheckSquare,
  Clock,
  MapPin,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  User as UserIcon,
} from 'lucide-react';

interface SubmissionQueueItem {
  id: string;
  sessionId: string;
  sessionName: string;
  surveyorName: string;
  surveyorEmail: string;
  versionNumber: number;
  isResubmission: boolean;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewerName?: string;
  rejectReason?: string;
  locationAddress?: string;
  stats: {
    totalMedia: number;
    totalDetections: number;
    layakCount: number;
    cukupLayakCount: number;
    tidakLayakCount: number;
  };
}

export default function AdminReviewQueuePage() {
  const toast = useToast();
  const [submissions, setSubmissions] = useState<SubmissionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('menunggu_review');

  const fetchQueue = async (status = 'menunggu_review') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reviews?status=${status}`);
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat antrean review.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue(statusFilter);
  }, [statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <CheckSquare className="w-7 h-7 text-blue-600" />
              Antrean Review & Approval Survei
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Verifikasi keabsahan data temuan lapangan, peta lokasi, dan tetapkan persetujuan atau penolakan.
            </p>
          </div>

          <button
            onClick={() => {
              fetchQueue(statusFilter);
              toast.info('Antrean review diperbarui.', 'Data Disinkronkan');
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Antrean
          </button>
        </div>

        {/* Filter Badges: Scrollable on small screens */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'menunggu_review', label: 'Menunggu Review' },
            { id: 'disetujui', label: 'Disetujui' },
            { id: 'ditolak', label: 'Ditolak' },
            { id: 'all', label: 'Semua Riwayat' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Review List */}
        {loading ? (
          <CardSkeleton count={4} />
        ) : submissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center text-slate-400">
            <CheckSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <h3 className="font-semibold text-slate-700 text-sm">Tidak Ada Submission dalam Antrean</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Saat ini tidak ada sesi survei dengan status &quot;{statusFilter.replace('_', ' ')}&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 break-words">{sub.sessionName}</h3>

                    {/* Initial vs Resubmission Badge (US-008) */}
                    {sub.isResubmission ? (
                      <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        Re-submission (v{sub.versionNumber})
                      </span>
                    ) : (
                      <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300">
                        Awal (v1)
                      </span>
                    )}

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

                  {sub.locationAddress && (
                    <div className="text-xs text-slate-500 flex items-center gap-1 break-words">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{sub.locationAddress}</span>
                    </div>
                  )}

                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      Surveyor: <strong>{sub.surveyorName}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      Disubmit: {new Date(sub.submittedAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Stats and Action */}
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                  <div className="text-left md:text-right text-xs">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">
                      {sub.stats.totalDetections} Temuan AI
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                      <span className="text-rose-600 font-semibold">{sub.stats.tidakLayakCount} Kritis</span> •{' '}
                      <span className="text-emerald-600 font-semibold">{sub.stats.layakCount} Layak</span>
                    </div>
                  </div>

                  <Link
                    href={`/admin/reviews/${sub.id}`}
                    className="px-3.5 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                  >
                    <span>Buka Review</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
