'use client';

import { ROLE_LABEL, normalizeRole } from '@/lib/access';
import React, { useMemo, useState } from 'react';
import { feasibilityText } from '@/lib/feasibility';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  GitMerge,
  Pencil,
  RotateCcw,
  Send,
  Settings,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  createdAt: string;
  changes: any;
  actor?: { id?: string; name?: string; email?: string; role?: string } | null;
}

type Tone = 'rose' | 'emerald' | 'blue' | 'indigo' | 'purple' | 'sky' | 'cyan' | 'amber' | 'slate' | 'teal';

const TONES: Record<Tone, { dot: string; text: string; soft: string }> = {
  rose: { dot: 'bg-rose-500', text: 'text-rose-700', soft: 'bg-rose-50 ring-rose-200' },
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50 ring-emerald-200' },
  blue: { dot: 'bg-blue-500', text: 'text-blue-700', soft: 'bg-blue-50 ring-blue-200' },
  indigo: { dot: 'bg-indigo-500', text: 'text-indigo-700', soft: 'bg-indigo-50 ring-indigo-200' },
  purple: { dot: 'bg-purple-500', text: 'text-purple-700', soft: 'bg-purple-50 ring-purple-200' },
  sky: { dot: 'bg-sky-500', text: 'text-sky-700', soft: 'bg-sky-50 ring-sky-200' },
  cyan: { dot: 'bg-cyan-500', text: 'text-cyan-700', soft: 'bg-cyan-50 ring-cyan-200' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700', soft: 'bg-amber-50 ring-amber-200' },
  slate: { dot: 'bg-slate-400', text: 'text-slate-700', soft: 'bg-slate-50 ring-slate-200' },
  teal: { dot: 'bg-teal-500', text: 'text-teal-700', soft: 'bg-teal-50 ring-teal-200' },
};

const ACTIONS: Record<string, { label: string; tone: Tone; Icon: React.ComponentType<{ className?: string }> }> = {
  ADMIN_REJECT_SURVEY: { label: 'Penolakan Admin', tone: 'rose', Icon: XCircle },
  ADMIN_APPROVE_SURVEY: { label: 'Persetujuan Admin', tone: 'emerald', Icon: CheckCircle2 },
  SURVEYOR_EDIT_DETECTION: { label: 'Edit Temuan', tone: 'blue', Icon: Pencil },
  ADMIN_CORRECT_DETECTION: { label: 'Koreksi Admin', tone: 'indigo', Icon: Pencil },
  SURVEYOR_START_REVISION: { label: 'Mulai Revisi', tone: 'purple', Icon: RotateCcw },
  SURVEYOR_RESUBMIT_REVISION: { label: 'Revisi Dikirim Kembali', tone: 'indigo', Icon: Send },
  SURVEYOR_SUBMIT_SURVEY: { label: 'Pengajuan Survei', tone: 'sky', Icon: Send },
  SURVEYOR_END_SESSION: { label: 'Sesi Diakhiri', tone: 'slate', Icon: Clock },
  SURVEYOR_UPLOAD_MEDIA: { label: 'Upload Media', tone: 'cyan', Icon: UploadCloud },
  SURVEYOR_DELETE_MEDIA: { label: 'Hapus Media', tone: 'rose', Icon: Trash2 },
  SURVEYOR_DELETE_DETECTION: { label: 'Hapus Temuan', tone: 'amber', Icon: Trash2 },
  UPDATE_SESSION_METADATA: { label: 'Perubahan Info Sesi', tone: 'slate', Icon: Settings },
  RESOLVE_CONFLICT: { label: 'Resolusi Konflik', tone: 'teal', Icon: GitMerge },
};

const actionMeta = (action: string) =>
  ACTIONS[action] || {
    label: action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    tone: 'slate' as Tone,
    Icon: FileText,
  };

const parseChanges = (raw: any) => {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

const fmtCoord = (c: number[]) => `${c[0].toFixed(5)}, ${c[1].toFixed(5)}`;

/** Only the fields that actually changed, as compact "old -> new" rows. */
function Diffs({ changes }: { changes: any }) {
  const prev = changes?.previous;
  const upd = changes?.updated;
  if (!upd) return null;

  const rows: { label: string; from: React.ReactNode; to: React.ReactNode }[] = [];
  if (upd.className && prev?.className && upd.className !== prev.className) {
    rows.push({ label: 'Kelas', from: prev.className, to: upd.className });
  }
  if (upd.condition && upd.condition.trim() !== (prev?.condition || '').trim()) {
    rows.push({ label: 'Kondisi', from: prev?.condition || '-', to: upd.condition });
  }
  if (upd.feasibility && prev?.feasibility && upd.feasibility !== prev.feasibility) {
    rows.push({
      label: 'Kelayakan',
      from: feasibilityText(prev.feasibility),
      to: feasibilityText(upd.feasibility),
    });
  }
  if (upd.locationCoordinates && JSON.stringify(upd.locationCoordinates) !== JSON.stringify(prev?.locationCoordinates)) {
    rows.push({
      label: 'Titik peta',
      from: prev?.locationCoordinates ? fmtCoord(prev.locationCoordinates) : 'posisi awal',
      to: fmtCoord(upd.locationCoordinates),
    });
  }
  if (rows.length === 0) return null;

  return (
    <dl className="mt-2 space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
          <dt className="w-16 shrink-0 font-semibold text-slate-400">{r.label}</dt>
          <dd className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-slate-400 line-through break-words">{r.from}</span>
            <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
            <span className="font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded break-words">{r.to}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Description, reject reason / notes and the field diffs of one log entry. */
function EntryBody({ log }: { log: AuditLog }) {
  const changes = parseChanges(log.changes);
  if (!changes) return null;
  return (
    <div className="text-xs text-slate-600 leading-relaxed">
      {changes.actionDescription && <p>{changes.actionDescription}</p>}

      {changes.rejectReason && (
        <div className="mt-2 rounded-xl bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-rose-900">
          <p className="font-semibold">Alasan penolakan: {changes.rejectReason}</p>
          {changes.reviewNotes && <p className="mt-0.5 text-[11px] text-rose-800">Catatan admin: &quot;{changes.reviewNotes}&quot;</p>}
        </div>
      )}
      {changes.notes && !changes.rejectReason && (
        <p className="mt-1 text-slate-500">
          <span className="font-semibold text-slate-600">Catatan:</span> {changes.notes}
        </p>
      )}
      <Diffs changes={changes} />
    </div>
  );
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const GROUP_GAP_MS = 5 * 60 * 1000;
const INITIAL_GROUPS = 6;

/** Consecutive entries of the same action by the same person (within 5 min) collapse into one row. */
function groupLogs(logs: AuditLog[]) {
  const groups: AuditLog[][] = [];
  for (const log of logs) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      prev &&
      prev.action === log.action &&
      (prev.actor?.id || prev.actor?.email) === (log.actor?.id || log.actor?.email) &&
      Math.abs(new Date(prev.createdAt).getTime() - new Date(log.createdAt).getTime()) <= GROUP_GAP_MS
    ) {
      last.push(log);
    } else {
      groups.push([log]);
    }
  }
  return groups;
}

export default function AuditTimeline({ logs }: { logs: AuditLog[] }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupLogs(logs), [logs]);
  const shown = showAll ? groups : groups.slice(0, INITIAL_GROUPS);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Day separators are precomputed so render stays pure.
  const showDayAt = shown.map((g, i) => i === 0 || dayOf(g[0].createdAt) !== dayOf(shown[i - 1][0].createdAt));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            Riwayat Aktivitas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Jejak perubahan data, penolakan, revisi, dan pengajuan pada sesi ini (terbaru di atas).
          </p>
        </div>
        <span className="shrink-0 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-semibold">
          {logs.length} catatan
        </span>
      </header>

      {logs.length === 0 ? (
        <div className="px-6 py-10 text-center text-slate-400">
          <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
          <p className="text-xs font-medium text-slate-600">Belum ada riwayat aktivitas yang tercatat pada sesi ini.</p>
        </div>
      ) : (
        <div className="px-5 sm:px-6 py-5">
          <ol className="relative">
            {shown.map((group, gi) => {
              const head = group[0];
              const meta = actionMeta(head.action);
              const tone = TONES[meta.tone];
              const day = dayOf(head.createdAt);
              const showDay = showDayAt[gi];
              const isGroup = group.length > 1;
              const expanded = open.has(head.id);
              const isLast = gi === shown.length - 1;
              const actor = head.actor;

              return (
                <React.Fragment key={head.id}>
                  {showDay && (
                    <li className="pl-10 pb-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 list-none">
                      {day}
                    </li>
                  )}
                  <li className="relative pl-10 pb-5 list-none">
                    {!isLast && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" aria-hidden />}
                    <span
                      className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white ${tone.soft} ring-1`}
                    >
                      <meta.Icon className={`w-4 h-4 ${tone.text}`} />
                    </span>

                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                        <span className={`text-sm font-bold ${tone.text}`}>{meta.label}</span>
                        {isGroup && (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                            ×{group.length}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          oleh <span className="font-semibold text-slate-700">{actor?.name || 'Sistem'}</span>
                          {actor?.role && <span className="text-slate-400"> · {ROLE_LABEL[normalizeRole(actor.role)]}</span>}
                        </span>
                      </div>
                      <time className="text-[11px] text-slate-400 tabular-nums" dateTime={head.createdAt}>
                        {timeOf(head.createdAt)}
                        {isGroup && ` – ${timeOf(group[group.length - 1].createdAt)}`}
                      </time>
                    </div>

                    <div className="mt-1.5">
                      {isGroup ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggle(head.id)}
                            aria-expanded={expanded}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                          >
                            {expanded ? 'Sembunyikan rincian' : `Lihat ${group.length} rincian`}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                          {expanded && (
                            <ul className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
                              {group.map((entry) => (
                                <li key={entry.id} className="space-y-0.5">
                                  <span className="text-[10px] text-slate-400 tabular-nums">{timeOf(entry.createdAt)}</span>
                                  <EntryBody log={entry} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        <EntryBody log={head} />
                      )}
                    </div>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>

          {groups.length > INITIAL_GROUPS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="ml-10 mt-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan ${groups.length - INITIAL_GROUPS} aktivitas lainnya`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
