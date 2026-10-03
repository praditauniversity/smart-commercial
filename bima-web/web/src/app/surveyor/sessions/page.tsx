'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { CardSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import {
  ClipboardList,
  PlusCircle,
  Clock,
  MapPin,
  Calendar,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface SessionItem {
  id: string;
  name: string;
  locationAddress?: string;
  locationType: string;
  surveyDate: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  _count: {
    mediaAssets: number;
    detections: number;
    submissions: number;
  };
}

export default function SurveyorSessionsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    const q = new URLSearchParams(window.location.search).get('status');
    return q || 'all';
  });

  const fetchSessions = async (status = 'all') => {
    setLoading(true);
    try {
      const url = status === 'all' ? '/api/sessions' : `/api/sessions?status=${status}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat daftar sesi survei.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions(filterStatus);
  }, [filterStatus]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'berlangsung':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-brand-green/10 text-brand-green border border-brand-green/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
            Sedang Berlangsung
          </span>
        );
      case 'selesai_menunggu_submit':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
            Selesai (Siap Submit)
          </span>
        );
      case 'menunggu_review':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-brand-orange/10 text-orange-700 border border-brand-orange/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Menunggu Review Supervisor
          </span>
        );
      case 'disetujui':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-brand-green/10 text-brand-green border border-brand-green/20 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Disetujui (Final)
          </span>
        );
      case 'ditolak':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Ditolak
          </span>
        );
      case 'perlu_perbaikan':
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Perlu Perbaikan (Draft Revisi)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-dashboard-bg flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 flex items-center gap-2.5">
              <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-brand-green shrink-0" />
              Daftar Sesi Survei Lapangan
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">
              Kelola sesi pemantauan aktif, upload media visual, dan pantau status review.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                fetchSessions(filterStatus);
                toast.info('Daftar sesi diperbarui.', 'Data Disinkronkan');
              }}
              className="flex-1 sm:flex-initial px-3 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 active:scale-95 text-zinc-900 font-medium text-xs rounded-md shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <Link
              href="/surveyor/new"
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-brand-green hover:bg-brand-green/90 active:scale-95 text-white font-medium text-xs sm:text-sm rounded-md shadow-sm flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Buat Sesi Baru
            </Link>
          </div>
        </div>

        {/* Filters: Horizontal scrollable on small mobile screens */}
        <div className="flex gap-1.5 sm:gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'all', label: 'Semua Status' },
            { id: 'berlangsung', label: 'Berlangsung' },
            { id: 'selesai_menunggu_submit', label: 'Siap Submit' },
            { id: 'menunggu_review', label: 'Menunggu Review' },
            { id: 'perlu_perbaikan', label: 'Perlu Revisi' },
            { id: 'ditolak', label: 'Ditolak' },
            { id: 'disetujui', label: 'Disetujui' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors active:scale-95 cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-brand-green text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sessions List */}
        {loading ? (
          <CardSkeleton count={6} />
        ) : sessions.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-500 mx-auto flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900">Belum Ada Sesi Survei</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mt-1 mb-6">
              Mulai pemantauan infrastruktur kawasan baru dengan membuat sesi survei pertama Anda.
            </p>
            <Link
              href="/surveyor/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green text-white font-medium text-xs rounded-md hover:bg-brand-green/90 transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Buat Sesi Sekarang
            </Link>
          </div>
        ) : (
          <div className="grid max-h-[80vh] grid-cols-1 gap-6 overflow-y-auto p-1 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/surveyor/sessions/${session.id}`}
                className="group bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h2 className="font-semibold tracking-tight text-zinc-900 text-base group-hover:underline line-clamp-1">
                      {session.name}
                    </h2>
                    {getStatusBadge(session.status)}
                  </div>

                  {session.locationAddress && (
                    <div className="text-sm text-zinc-500 flex items-start gap-1.5 mb-3 line-clamp-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span>{session.locationAddress}</span>
                    </div>
                  )}

                  <div className="text-sm text-zinc-500 flex items-center gap-1.5 mb-4">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {new Date(session.surveyDate).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <strong className="font-semibold text-zinc-900">{session._count.mediaAssets}</strong> Media
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                      <strong className="font-semibold text-zinc-900">{session._count.detections}</strong> Temuan
                    </span>
                  </div>

                  <span className="flex items-center text-brand-green font-medium group-hover:translate-x-1 transition-transform">
                    Buka Sesi
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
