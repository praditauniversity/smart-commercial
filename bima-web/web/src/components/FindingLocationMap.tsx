'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, RotateCcw, Loader2, Info } from 'lucide-react';
import { useToast } from './ToastProvider';

const FindingLocationMapInner = dynamic(() => import('./FindingLocationMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center bg-slate-100 rounded-xl text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600 mb-2" />
      <span className="text-xs">Memuat peta interaktif...</span>
    </div>
  ),
});

interface FindingLocationMapProps {
  sessionLocationType?: 'point' | 'polygon';
  sessionGeojson?: any;
  sessionAddress?: string | null;
  initialPointGeojson?: any;
  canEdit: boolean;
  onLocationChange: (pointGeojson: { type: string; coordinates: [number, number] }, address?: string) => void;
}

// Helper to extract [lat, lng] from Point or Polygon or JSON string
function extractLatLng(geojson: any): [number, number] | null {
  if (!geojson) return null;
  try {
    const geo = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
      return [geo.coordinates[1], geo.coordinates[0]];
    }
    if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0]) && geo.coordinates[0].length > 0) {
      return [geo.coordinates[0][0][1], geo.coordinates[0][0][0]];
    }
  } catch {}
  return null;
}

export default function FindingLocationMap({
  sessionLocationType = 'point',
  sessionGeojson,
  sessionAddress,
  initialPointGeojson,
  canEdit,
  onLocationChange,
}: FindingLocationMapProps) {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [findingPoint, setFindingPoint] = useState<[number, number] | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [flyToPoint, setFlyToPoint] = useState<[number, number] | null>(null);

  // Sync initial findingPoint only when initialPointGeojson or sessionGeojson has a distinct new point
  useEffect(() => {
    setMounted(true);
    const targetPt = extractLatLng(initialPointGeojson) || extractLatLng(sessionGeojson);
    if (targetPt) {
      setFindingPoint((prev) => {
        if (!prev) return targetPt;
        // Check if initialPointGeojson is explicitly a new Point
        const initPt = extractLatLng(initialPointGeojson);
        if (initPt && (Math.abs(initPt[0] - prev[0]) > 0.000001 || Math.abs(initPt[1] - prev[1]) > 0.000001)) {
          return initPt;
        }
        return prev;
      });
    }
  }, [initialPointGeojson, sessionGeojson]);

  const handlePointChange = (newPoint: [number, number], newGeojson: { type: string; coordinates: [number, number] }) => {
    setFindingPoint(newPoint);
    setIsModified(true);
    onLocationChange(newGeojson);
    toast.info(`Titik lokasi temuan digeser ke: [${newPoint[0].toFixed(5)}, ${newPoint[1].toFixed(5)}]`, 'Titik Diubah');
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation tidak didukung oleh browser Anda.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const point: [number, number] = [lat, lng];
        const geojson: { type: string; coordinates: [number, number] } = { type: 'Point', coordinates: [lng, lat] };
        setFindingPoint(point);
        setFlyToPoint(point);   // auto-zoom peta ke titik GPS
        setIsModified(true);
        onLocationChange(geojson);
        toast.success(`Lokasi GPS berhasil diambil: [${lat.toFixed(5)}, ${lng.toFixed(5)}]`, 'GPS Terhubung');
      },
      (err) => {
        setGpsLoading(false);
        console.warn('GPS error:', err);
        toast.error('Gagal mengambil lokasi GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleResetToSessionCenter = () => {
    const sessionPt = extractLatLng(sessionGeojson);
    if (sessionPt) {
      setFindingPoint(sessionPt);
      setFlyToPoint(sessionPt);
      setIsModified(false);
      onLocationChange({ type: 'Point', coordinates: [sessionPt[1], sessionPt[0]] });
      toast.info('Titik lokasi temuan dikembalikan ke posisi awal sesi.', 'Titik Direset');
    }
  };

  const handleOutsideArea = () => {
    toast.warning(
      'Titik lokasi berada di luar batas area survei. Geser pin ke dalam area biru.',
      'Di Luar Area Survei'
    );
  };

  const handleGpsWithAreaCheck = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation tidak didukung oleh browser Anda.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const point: [number, number] = [lat, lng];
        const geojson: { type: string; coordinates: [number, number] } = { type: 'Point', coordinates: [lng, lat] };

        // Check if GPS point is within session area
        const sessionGeo = sessionGeojson ? (typeof sessionGeojson === 'string' ? JSON.parse(sessionGeojson) : sessionGeojson) : null;
        if (sessionGeo?.type === 'Polygon') {
          const polygonCoords: [number, number][] = (sessionGeo.coordinates[0] as number[][]).map((c: number[]) => [c[1], c[0]]);
          if (polygonCoords.length >= 3) {
            const L_ref = require('leaflet');
            const latlngs = polygonCoords.map(([plat, plng]: [number, number]) => L_ref.latLng(plat, plng));
            const poly = L_ref.polygon(latlngs);
            const bounds = poly.getBounds();
            if (!bounds.contains(L_ref.latLng(lat, lng))) {
              toast.warning(
                `Lokasi GPS Anda ([${lat.toFixed(4)}, ${lng.toFixed(4)}]) berada di luar batas area survei. Pin tidak dipindahkan.`,
                'GPS Di Luar Area'
              );
              return;
            }
          }
        }

        setFindingPoint(point);
        setFlyToPoint(point);
        setIsModified(true);
        onLocationChange(geojson);
        toast.success(`Lokasi GPS berhasil diambil: [${lat.toFixed(5)}, ${lng.toFixed(5)}]`, 'GPS Terhubung');
      },
      (err) => {
        setGpsLoading(false);
        console.warn('GPS error:', err);
        toast.error('Gagal mengambil lokasi GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!mounted) {
    return (
      <div className="w-full h-48 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Map Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <MapPin className="w-4 h-4 text-rose-600" />
          <span>Lokasi & Peta Temuan</span>
          {sessionLocationType === 'polygon' && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-semibold text-[10px]">
              Area Sesi Terpetakan
            </span>
          )}
          {isModified && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-semibold text-[10px] flex items-center gap-0.5">
              Titik Diubah
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleGpsWithAreaCheck}
              disabled={gpsLoading}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
              GPS Saya
            </button>
            <button
              type="button"
              onClick={handleResetToSessionCenter}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset titik ke titik awal sesi"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Map Viewport */}
      <div className="relative w-full h-56 sm:h-64 rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
        <FindingLocationMapInner
          sessionLocationType={sessionLocationType}
          sessionGeojson={sessionGeojson}
          findingPoint={findingPoint}
          canEdit={canEdit}
          onPointChange={handlePointChange}
          flyToPoint={flyToPoint}
          onOutsideArea={handleOutsideArea}
        />
      </div>

      {/* Map Helper & Coordinates readout */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 gap-1.5">
        <div className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>
            {sessionLocationType === 'polygon'
              ? canEdit
                ? 'Area biru = Batas resmi sesi (tetap). Pin merah = Titik temuan objek (klik peta/geser pin untuk menyesuaikan).'
                : 'Area biru = Batas resmi sesi (tetap). Pin merah = Titik temuan objek survei.'
              : canEdit
              ? 'Pin merah = Titik temuan objek survei (klik peta atau geser pin untuk memindahkan).'
              : 'Pin merah = Titik temuan objek survei.'}
          </span>
        </div>

        {findingPoint && (
          <div className="font-mono text-slate-700 font-semibold text-[10px]">
            [{findingPoint[0].toFixed(5)}, {findingPoint[1].toFixed(5)}]
          </div>
        )}
      </div>
    </div>
  );
}
