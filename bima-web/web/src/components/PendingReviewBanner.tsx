'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';

/** Jumlah pengajuan survei yang menunggu disetujui/direview supervisor, dengan tautan ke antrean. */
export default function PendingReviewBanner({ href = '/supervisor/reviews' }: { href?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/reviews?status=menunggu_review')
      .then((r) => r.json())
      .then((j) => setCount(Array.isArray(j.submissions) ? j.submissions.length : null))
      .catch(() => setCount(null));
  }, []);

  if (count === null) return null;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${count > 0 ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
    >
      <span className={`rounded-xl p-2 ${count > 0 ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'}`}><ClipboardCheck className="h-5 w-5" /></span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-slate-900">
          {count > 0 ? `${count} pengajuan survei menunggu disetujui/direview supervisor` : 'Tidak ada pengajuan survei yang menunggu review'}
        </span>
        <span className="block text-xs text-slate-500">Buka antrean review untuk menyetujui atau menolak.</span>
      </span>
      <span className="text-xs font-semibold text-blue-700">Antrean review →</span>
    </Link>
  );
}
