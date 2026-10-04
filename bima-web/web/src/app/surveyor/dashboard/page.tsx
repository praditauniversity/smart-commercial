'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import DashboardSummary from '@/components/DashboardSummary';
import { workflowFor } from '@/lib/workflow';
import { LayoutDashboard, PlusCircle } from 'lucide-react';

/** Dashboard surveyor: hanya sesi dan temuan milik sendiri (dibatasi di server). */
export default function SurveyorDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-dashboard-bg pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              <LayoutDashboard className="h-6 w-6 shrink-0 text-brand-green" />
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Ringkasan sesi dan temuan milik Anda. Tinjauan dan koreksi dilakukan oleh supervisor.</p>
          </div>
          <Link href="/surveyor/new" className="inline-flex items-center gap-2 rounded-md bg-brand-green px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-green/90 active:scale-95 sm:text-sm">
            <PlusCircle className="h-4 w-4" />Buat Sesi Baru
          </Link>
        </div>
        <DashboardSummary
          sessionHref={(id) => `/surveyor/sessions/${id}`}
          workflow={(sessions, totals) => workflowFor('surveyor', sessions, totals, '')}
          allSessionsHref="/surveyor/sessions"
          allSessionsLabel="Semua sesi"
        />
      </main>
    </div>
  );
}
