'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import { StatsWidgetSkeleton } from '@/components/SkeletonLoaders';
import {
  BarChart3,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Filter,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

const LeafletDashboardMap = dynamic(
  () => import('@/components/LeafletDashboardMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    ),
  }
);

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [mapPoints, setMapPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);

  // Filters
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedFeasibility, setSelectedFeasibility] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    // Fetch classes list for dropdown
    fetch('/api/admin/classes')
      .then((res) => res.json())
      .then((data) => {
        if (data.classes) setClasses(data.classes);
      })
      .catch(() => {});
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClass !== 'all') params.append('classId', selectedClass);
      if (selectedFeasibility !== 'all') params.append('feasibility', selectedFeasibility);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [statsRes, pointsRes] = await Promise.all([
        fetch(`/api/dashboard/stats?${params.toString()}`),
        fetch(`/api/dashboard/map-points?${params.toString()}`),
      ]);

      const [statsData, pointsData] = await Promise.all([
        statsRes.json(),
        pointsRes.json(),
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (pointsData.success) setMapPoints(pointsData.points || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedClass, selectedFeasibility, startDate, endDate]);

  const defaultCenter: [number, number] = [-6.2088, 106.8456];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
              Dashboard Rekap Hasil Pemantauan Kawasan
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Data agregat resmi dari seluruh sesi survei yang telah disetujui (Approved) oleh admin.
            </p>
          </div>

          {/* Filter Bar: Mobile friendly stacking */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs w-full lg:w-auto">
            <div className="flex items-center gap-1 text-xs text-slate-500 font-semibold px-2">
              <Filter className="w-3.5 h-3.5" />
              Filter:
            </div>

            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.name}
                </option>
              ))}
            </select>

            <select
              value={selectedFeasibility}
              onChange={(e) => setSelectedFeasibility(e.target.value)}
              className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Kelayakan</option>
              <option value="layak">Layak</option>
              <option value="cukup_layak">Cukup Layak</option>
              <option value="tidak_layak">Tidak Layak (Kritis)</option>
            </select>
          </div>
        </div>

        {loading && !stats ? (
          <div className="space-y-6">
            <StatsWidgetSkeleton count={4} />
            <div className="w-full h-80 bg-slate-200 rounded-2xl animate-pulse" />
          </div>
        ) : (
          <>
            {/* KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Sesi Disetujui
                  </span>
                  <div className="p-2 sm:p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 sm:mt-3">
                  {stats?.totalApprovedSessions || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1">Sesi survei resmi</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Total Temuan
                  </span>
                  <div className="p-2 sm:p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 sm:mt-3">
                  {stats?.totalFindings || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1">Objek teridentifikasi AI</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Kondisi Kritis
                  </span>
                  <div className="p-2 sm:p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-rose-600 mt-2 sm:mt-3">
                  {stats?.feasibility?.tidak_layak || 0}
                </div>
                <div className="text-xs text-rose-700/80 mt-1 font-medium">
                  Tingkat &quot;Tidak Layak&quot;
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Kondisi Baik
                  </span>
                  <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-600 mt-2 sm:mt-3">
                  {stats?.feasibility?.layak || 0}
                </div>
                <div className="text-xs text-emerald-700/80 mt-1 font-medium">
                  Tingkat &quot;Layak&quot;
                </div>
              </div>
            </div>

            {/* Map Distribution Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Peta Sebaran Temuan Infrastruktur (OpenStreetMap)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan {mapPoints.length} titik temuan dari hasil survei yang telah disetujui.
                  </p>
                </div>
              </div>

              <div className="w-full h-96 rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100 relative">
                <LeafletDashboardMap points={mapPoints} defaultCenter={defaultCenter} />
              </div>
            </div>

            {/* Per-Class Summary Table (US-010) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Rekap Temuan Per Kelas Objek
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Nama Kelas</th>
                      <th className="py-3 px-4">Total Temuan</th>
                      <th className="py-3 px-4 text-emerald-700">Layak</th>
                      <th className="py-3 px-4 text-rose-700">Tidak Layak (Kritis)</th>
                      <th className="py-3 px-4">Persentase Kritis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!stats?.byClass || stats.byClass.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400">
                          Belum ada data temuan dari sesi yang disetujui.
                        </td>
                      </tr>
                    ) : (
                      stats.byClass.map((cls: any, i: number) => {
                        const pct = cls.count > 0 ? Math.round((cls.tidakLayak / cls.count) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              {cls.displayName || cls.name}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-800">{cls.count}</td>
                            <td className="py-3.5 px-4 text-emerald-600 font-medium">
                              {cls.count - cls.tidakLayak}
                            </td>
                            <td className="py-3.5 px-4 text-rose-600 font-bold">{cls.tidakLayak}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-rose-500 h-1.5 rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-semibold text-slate-700">
                                  {pct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
