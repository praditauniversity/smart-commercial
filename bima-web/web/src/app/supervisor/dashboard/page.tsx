'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import DashboardSummary from '@/components/DashboardSummary';
import { workflowFor } from '@/lib/workflow';
import { LayoutDashboard } from 'lucide-react';

/** Dashboard supervisor: alur kerja surveyor entri -> supervisor koreksi -> review dan persetujuan, plus ringkasan temuan. */
export default function SupervisorDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 sm:text-2xl">
            <LayoutDashboard className="h-6 w-6 shrink-0 text-blue-600" />
            Dashboard Supervisor
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">Alur kerja: surveyor mengentri temuan → supervisor mengoreksi → pengajuan direview, lalu disetujui atau ditolak.</p>
        </div>
        <DashboardSummary
          sessionHref={(id) => `/supervisor/sessions/${id}`}
          workflow={(sessions, totals) => workflowFor('supervisor', sessions, totals, '/supervisor/reviews')}
          allSessionsHref="/supervisor/analitik"
          allSessionsLabel="Semua lokasi di Analitik"
        />
      </main>
    </div>
  );
}
