'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import AnalyticsView, { AnalyticsHeader } from '@/components/AnalyticsView';

export default function SupervisorAnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <AnalyticsHeader subtitle="Peta sebaran, daftar lokasi, dan hasil koreksi supervisor." />
        <AnalyticsView sessionHref={(id) => `/supervisor/sessions/${id}`} showLatency={false} />
      </main>
    </div>
  );
}
