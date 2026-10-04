'use client';

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { mapConfig } from '@/lib/public-config';
import { BAND_LABEL } from '@/lib/risk';
import type { MapMarker } from '@/lib/map-points';

/** Warna penanda mengikuti pita prioritas; abu-abu = lokasi tanpa skor (hanya Monitoring Kepatuhan / rambu normal). */
const BAND_HEX: Record<string, string> = { rendah: '#10b981', sedang: '#f59e0b', tinggi: '#f97316', kritikal: '#e11d48', none: '#64748b' };

function Fit({ markers, center }: { markers: MapMarker[]; center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 1) map.flyTo(markers[0].position, 15, { animate: true, duration: 0.8 });
    else if (markers.length > 1) map.fitBounds(L.latLngBounds(markers.map((m) => m.position)), { padding: [40, 40], maxZoom: 16, animate: true });
    else map.setView(center, 12);
  }, [map, markers, center]);
  return null;
}

function pin(m: MapMarker) {
  const color = BAND_HEX[m.worstBand ?? 'none'];
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);color:#fff;font:700 11px/24px system-ui,sans-serif;text-align:center">${m.count > 99 ? '99+' : m.count}</div>`,
  });
}

export default function LeafletDashboardMap({ markers, defaultCenter, detailHref }: {
  markers: MapMarker[];
  defaultCenter: [number, number];
  detailHref: (sessionId: string) => string;
}) {
  const icons = useMemo(() => new Map(markers.map((m) => [m.key, pin(m)])), [markers]);
  return (
    <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom style={{ width: '100%', height: '100%' }}>
      <TileLayer attribution={mapConfig.attribution()} url={mapConfig.tileUrl()} />
      <Fit markers={markers} center={defaultCenter} />
      {markers.map((m) => (
        <Marker key={m.key} position={m.position} icon={icons.get(m.key)}>
          <Popup minWidth={220}>
            <div className="space-y-1 text-xs">
              <Link href={detailHref(m.sessionId)} className="block text-sm font-bold text-blue-700 hover:underline">{m.sessionName}</Link>
              {m.locationAddress && <div className="text-slate-500">{m.locationAddress}</div>}
              <div className="font-semibold text-slate-800">
                {m.worstBand ? `Risiko tertinggi: ${BAND_LABEL[m.worstBand]} (${m.worstScore})` : 'Tanpa skor risiko'} · {m.count} temuan
              </div>
              <ul className="divide-y divide-slate-100">
                {m.classes.slice(0, 6).map((c) => (
                  <li key={c.displayName} className="flex justify-between gap-3 py-0.5"><span>{c.displayName}</span><b className="font-mono">{c.count}</b></li>
                ))}
              </ul>
              {m.surveyorName && <div className="text-[10px] text-slate-400">Surveyor: {m.surveyorName}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
