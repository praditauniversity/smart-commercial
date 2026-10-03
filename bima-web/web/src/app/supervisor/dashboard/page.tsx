'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import RiskOverview from '@/components/RiskOverview';
import CorrectionsLog from '@/components/CorrectionsLog';
import PendingReviewBanner from '@/components/PendingReviewBanner';
import { ClipboardCheck } from 'lucide-react';

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white" aria-hidden>{n}</span>
      <div>
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
        <p className="text-xs text-slate-500 sm:text-sm">{hint}</p>
      </div>
    </div>
  );
}

/** Dashboard supervisor mengikuti alur kerja: surveyor entri temuan, supervisor mengoreksi, lalu review dan setujui/tolak. */
export default function SupervisorDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 sm:text-2xl">
            <ClipboardCheck className="h-6 w-6 shrink-0 text-blue-600" />
            Dashboard Supervisor
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Alur kerja: surveyor mengentri temuan → supervisor mengoreksi → pengajuan direview, lalu disetujui atau ditolak.
          </p>
        </div>

        <section className="space-y-4" aria-label="Langkah 1: entri temuan surveyor">
          <Step n={1} title="Entri temuan oleh surveyor" hint="Sesi dan temuan dari seluruh surveyor. Buka sebuah sesi untuk mengoreksi temuannya." />
          <RiskOverview title="Ringkasan risiko" detailHref={(id) => `/supervisor/sessions/${id}`} showSurveyorFilter />
        </section>

        <section className="space-y-4" aria-label="Langkah 2: koreksi supervisor">
          <Step n={2} title="Koreksi oleh supervisor" hint="Konfirmasi benar, tandai keliru, ubah kelas/kondisi/severity, atau catat temuan terlewat pada halaman sesi." />
          <CorrectionsLog />
        </section>

        <section className="space-y-4" aria-label="Langkah 3: review dan persetujuan">
          <Step n={3} title="Review dan persetujuan" hint="Setelah dikoreksi, setujui atau tolak pengajuan survei dari surveyor." />
          <PendingReviewBanner />
        </section>
      </main>
    </div>
  );
}
