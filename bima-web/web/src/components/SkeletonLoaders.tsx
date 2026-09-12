'use client';

import React from 'react';

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs p-0 animate-pulse flex flex-col justify-between"
        >
          <div className="h-48 bg-slate-200 w-full" />
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-slate-200 rounded w-1/2" />
              <div className="h-4 bg-slate-200 rounded w-1/4" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="h-3 bg-slate-100 rounded w-4/5" />
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <div className="h-3 bg-slate-100 rounded w-1/3" />
              <div className="h-3 bg-slate-200 rounded w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatsWidgetSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 bg-slate-200 rounded w-1/2" />
            <div className="w-8 h-8 rounded-xl bg-slate-100" />
          </div>
          <div className="h-7 bg-slate-300 rounded w-1/3" />
          <div className="h-3 bg-slate-100 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs animate-pulse">
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
        <div className="h-4 bg-slate-200 rounded w-1/4" />
        <div className="h-8 bg-slate-200 rounded-xl w-28" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="p-4 flex items-center justify-between gap-4">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-3.5 bg-slate-200 rounded"
                style={{ width: `${Math.floor(100 / cols) - 4}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailWorkspaceSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="h-6 bg-slate-300 rounded w-1/3" />
            <div className="h-4 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 bg-slate-200 rounded-xl w-32" />
            <div className="h-10 bg-slate-200 rounded-xl w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
        </div>
      </div>

      {/* Tabs & Content Grid Skeleton */}
      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <div className="h-8 bg-slate-200 rounded-xl w-36" />
        <div className="h-8 bg-slate-100 rounded-xl w-36" />
      </div>

      <CardSkeleton count={6} />
    </div>
  );
}
