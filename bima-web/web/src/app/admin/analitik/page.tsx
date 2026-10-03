'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import AnalyticsView, { AnalyticsHeader } from '@/components/AnalyticsView';

export default function AdminAnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-dashboard-bg pb-24 sm:pb-16">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <AnalyticsHeader subtitle="Peta sebaran, daftar lokasi, hasil koreksi supervisor, dan latensi sistem terhadap target ≤5 menit per lokasi." />
        <AnalyticsView sessionHref={(id) => `/supervisor/sessions/${id}`} showLatency />
      </main>
    </div>
  );
}
