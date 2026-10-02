'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import RiskOverview from '@/components/RiskOverview';
import CorrectionsLog from '@/components/CorrectionsLog';
import { ClipboardCheck } from 'lucide-react';

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
            Temuan dari seluruh surveyor untuk ditinjau dan dikoreksi. Buka sebuah sesi untuk menandai temuan keliru atau terlewat dan mengubah severity.
          </p>
        </div>
        <RiskOverview detailHref={(id) => `/supervisor/sessions/${id}`} showSurveyorFilter />
        <CorrectionsLog />
      </main>
    </div>
  );
}
