'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export default function Pagination({ page, pageSize, total, onPageChange, itemLabel = 'temuan' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const buttonClass =
    'px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1 transition-all';

  return (
    <nav
      aria-label="Navigasi halaman"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2"
    >
      <p className="text-xs text-zinc-500">
        Menampilkan {from}–{to} dari {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
          Sebelumnya
        </button>
        <span className="text-xs font-medium text-zinc-900 px-2">
          Halaman {page} / {totalPages}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
}
