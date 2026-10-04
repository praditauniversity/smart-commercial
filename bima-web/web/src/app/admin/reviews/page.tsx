'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { CardSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import { ReviewCountChips } from '@/components/ReviewFindings';
import type { ReviewCounts } from '@/lib/review-summary';
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
  review: ReviewCounts;
  stats: {
    totalMedia: number;
    totalDetections: number;
    layakCount: number;
    cukupLayakCount: number;
    tidakLayakCount: number;
  };
}

export default function AdminReviewQueuePage() {
  // Halaman yang sama dipakai di /admin/reviews dan /supervisor/reviews; tautan mengikuti bagian aktif.
  const reviewBase = usePathname().startsWith('/supervisor') ? '/supervisor/reviews' : '/admin/reviews';
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
    <div className="min-h-screen bg-dashboard-bg flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 flex items-center gap-2.5">
              <CheckSquare className="w-7 h-7 text-brand-green" />
              Antrean Review & Approval Survei
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Verifikasi keabsahan data temuan lapangan, peta lokasi, dan tetapkan persetujuan atau penolakan.
            </p>
          </div>

          <button
            onClick={() => {
              fetchQueue(statusFilter);
              toast.info('Antrean review diperbarui.', 'Data Disinkronkan');
            }}
            className="px-3.5 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 active:scale-95 rounded-md text-sm font-medium text-zinc-900 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
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
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-brand-green text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
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
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-8 sm:p-12 text-center text-zinc-500">
            <CheckSquare className="w-10 h-10 mx-auto mb-2 text-zinc-300" />
            <h3 className="font-medium text-zinc-900 text-sm">Tidak Ada Submission dalam Antrean</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Saat ini tidak ada sesi survei dengan status &quot;{statusFilter.replace('_', ' ')}&quot;.
            </p>
          </div>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-sm [&>:last-child]:border-b-0">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border-b border-zinc-100 hover:bg-zinc-50/60 px-4 sm:px-5 py-4 transition-colors flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm sm:text-base text-zinc-900 break-words">{sub.sessionName}</h3>

                    {/* Initial vs Resubmission Badge (US-007) */}
                    {sub.isResubmission ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        Re-submission (v{sub.versionNumber})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                        Awal (v1)
                      </span>
                    )}

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                        sub.status === 'disetujui'
                          ? 'bg-brand-green/10 text-brand-green border border-brand-green/20'
                          : sub.status === 'ditolak'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-brand-orange/10 text-orange-700 border border-brand-orange/30'
                      }`}
                    >
                      {sub.status.replace('_', ' ')}
                    </span>
                  </div>

                  {sub.locationAddress && (
                    <div className="text-xs text-zinc-500 flex items-center gap-1 break-words">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{sub.locationAddress}</span>
                    </div>
                  )}

                  <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      Surveyor: <strong>{sub.surveyorName}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      Disubmit: {new Date(sub.submittedAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Stats and Action */}
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-zinc-100">
                  <div className="text-left md:text-right text-xs space-y-1">
                    <div className="font-semibold text-zinc-900 text-xs sm:text-sm">
                      {sub.review.totalTemuan} Temuan AI
                    </div>
                    <ReviewCountChips counts={sub.review} />
                  </div>

                  <Link
                    href={`${reviewBase}/${sub.id}`}
                    className="px-3.5 sm:px-4 py-2 bg-brand-green hover:bg-brand-green/90 active:scale-95 text-white font-medium text-sm rounded-md shadow-sm flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
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
