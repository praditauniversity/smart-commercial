'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import DashboardSummary from '@/components/DashboardSummary';
import { workflowFor } from '@/lib/workflow';
import { LayoutDashboard } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-dashboard-bg pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            <LayoutDashboard className="h-6 w-6 shrink-0 text-brand-green" />
            Dashboard
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Ringkasan seluruh sesi dan temuan dari semua surveyor. Peta, hasil koreksi, dan latensi ada di menu Analitik.</p>
        </div>
        <DashboardSummary
          sessionHref={(id) => `/supervisor/sessions/${id}`}
          workflow={(sessions, totals) => workflowFor('admin', sessions, totals, '/admin/reviews')}
          allSessionsHref="/admin/analitik"
          allSessionsLabel="Semua lokasi di Analitik"
        />
      </main>
    </div>
  );
}
