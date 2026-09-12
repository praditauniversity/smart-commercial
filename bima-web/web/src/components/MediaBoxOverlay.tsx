'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayDetection {
  id: string;
  className: string;
  displayName?: string;
  bbox: BoundingBox;
  condition: string;
  feasibility: 'layak' | 'cukup_layak' | 'tidak_layak';
  hasConflict?: boolean;
  conflictDetails?: any;
}

interface MediaBoxOverlayProps {
  mediaUrl: string;
  mediaType?: 'image' | 'video';
  detections: OverlayDetection[];
  selectedDetectionId?: string | null;
  onSelectDetection?: (detection: OverlayDetection) => void;
  className?: string;
}

export default function MediaBoxOverlay({
  mediaUrl,
  mediaType = 'image',
  detections,
  selectedDetectionId,
  onSelectDetection,
  className = '',
}: MediaBoxOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getFeasibilityColor = (feasibility: string, isConflict?: boolean) => {
    if (isConflict) {
      return {
        border: 'border-amber-400 bg-amber-500/25',
        badge: 'bg-amber-500 text-white',
        text: 'text-amber-700',
      };
    }
    switch (feasibility) {
      case 'tidak_layak':
        return {
          border: 'border-rose-500 bg-rose-500/20',
          badge: 'bg-rose-600 text-white',
          text: 'text-rose-700',
        };
      case 'cukup_layak':
        return {
          border: 'border-amber-500 bg-amber-500/20',
          badge: 'bg-amber-600 text-white',
          text: 'text-amber-700',
        };
      case 'layak':
      default:
        return {
          border: 'border-emerald-500 bg-emerald-500/20',
          badge: 'bg-emerald-600 text-white',
          text: 'text-emerald-700',
        };
    }
  };

  return (
    <div className={`flex items-center justify-center bg-slate-950/90 rounded-2xl p-2 sm:p-3 overflow-hidden shadow-inner ${className}`}>
      {/* Intrinsic Media Frame (Wraps exact image/video bounds without letterbox margin shift) */}
      <div className="relative inline-block max-w-full max-h-[340px] sm:max-h-[500px]">
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            controls
            className="block w-auto h-auto max-w-full max-h-[340px] sm:max-h-[500px] object-contain rounded-xl shadow-lg"
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Visual Media"
            className="block w-auto h-auto max-w-full max-h-[340px] sm:max-h-[500px] object-contain rounded-xl shadow-lg"
          />
        )}

        {/* Normalized Bounding Box Overlays */}
        <div className="absolute inset-0 pointer-events-none">
          {detections.map((det) => {
            const colors = getFeasibilityColor(det.feasibility, det.hasConflict);
            const isSelected = selectedDetectionId === det.id;
            const isHovered = hoveredId === det.id;

            const left = `${det.bbox.x * 100}%`;
            const top = `${det.bbox.y * 100}%`;
            const width = `${det.bbox.width * 100}%`;
            const height = `${det.bbox.height * 100}%`;

            return (
              <div
                key={det.id}
                onClick={() => onSelectDetection && onSelectDetection(det)}
                onMouseEnter={() => setHoveredId(det.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ left, top, width, height }}
                className={`absolute border-2 transition-all cursor-pointer pointer-events-auto rounded-xs ${
                  colors.border
                } ${isSelected || isHovered ? 'ring-4 ring-blue-400 scale-[1.01] z-30 shadow-lg' : 'z-20'} ${
                  det.hasConflict ? 'animate-pulse' : ''
                }`}
              >
                {/* Badge Tag */}
                <div
                  className={`absolute -top-6 sm:-top-7 left-0 px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[11px] font-semibold whitespace-nowrap shadow-xs flex items-center gap-1 ${
                    colors.badge
                  }`}
                >
                  {det.hasConflict && <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />}
                  <span className="truncate max-w-[100px] sm:max-w-[160px]">{det.displayName || det.className}</span>
                  <span className="opacity-90 font-normal uppercase text-[8px] sm:text-[9px] px-1 bg-black/20 rounded hidden xs:inline">
                    {det.feasibility.replace('_', ' ')}
                  </span>
                </div>

                {/* Hover Tooltip Details */}
                {(isHovered || isSelected) && (
                  <div className="absolute left-0 top-full mt-1 bg-slate-900/95 text-white p-2 rounded-lg text-[11px] shadow-xl min-w-[150px] sm:min-w-[180px] max-w-[220px] sm:max-w-[260px] z-40 backdrop-blur-xs border border-slate-700 pointer-events-none break-words">
                    <div className="font-bold text-slate-100 mb-0.5">
                      {det.displayName || det.className}
                    </div>
                    <div className="text-slate-300 text-[10px] sm:text-[11px] leading-relaxed mb-1 line-clamp-3">
                      {det.condition}
                    </div>
                    {det.hasConflict && det.conflictDetails && (
                      <div className="p-1 bg-amber-500/20 border border-amber-500/40 rounded text-amber-300 text-[9px] sm:text-[10px] mt-1 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{det.conflictDetails.reason || 'Konflik kelas terdeteksi.'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
