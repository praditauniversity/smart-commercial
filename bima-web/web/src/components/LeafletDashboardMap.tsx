'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Layers, MapPin, User as UserIcon } from 'lucide-react';

interface DashboardMapPoint {
  id: string;
  className: string;
  displayName: string;
  condition: string;
  feasibility: string;
  sessionName: string;
  locationAddress?: string;
  surveyDate?: string;
  surveyorName?: string;
  geometry: any;
  mediaUrl?: string;
  mediaType?: string;
}

interface LeafletDashboardMapProps {
  points: DashboardMapPoint[];
  defaultCenter: [number, number];
}

function DashboardMapBoundsUpdater({ points, defaultCenter }: LeafletDashboardMapProps) {
  const map = useMap();

  useEffect(() => {
    if (points && points.length > 0) {
      const validLatLngs: [number, number][] = [];
      for (const pt of points) {
        if (pt.geometry?.type === 'Point' && Array.isArray(pt.geometry.coordinates)) {
          validLatLngs.push([pt.geometry.coordinates[1], pt.geometry.coordinates[0]]);
        }
      }
      if (validLatLngs.length === 1) {
        map.flyTo(validLatLngs[0], 15, { animate: true, duration: 1.0 });
      } else if (validLatLngs.length > 1) {
        const bounds = L.latLngBounds(validLatLngs);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
      }
    }
  }, [map, points]);

  return null;
}

export default function LeafletDashboardMap({ points, defaultCenter }: LeafletDashboardMapProps) {
  const [icon, setIcon] = useState<L.Icon | null>(null);

  useEffect(() => {
    const customIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    setIcon(customIcon);
  }, []);

  return (
    <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom={true} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DashboardMapBoundsUpdater points={points} defaultCenter={defaultCenter} />

      {points.map((pt) => {
        let lat = defaultCenter[0];
        let lng = defaultCenter[1];

        if (pt.geometry?.type === 'Point' && Array.isArray(pt.geometry.coordinates)) {
          lng = pt.geometry.coordinates[0];
          lat = pt.geometry.coordinates[1];
        } else if (
          pt.geometry?.type === 'Polygon' &&
          Array.isArray(pt.geometry.coordinates?.[0]?.[0])
        ) {
          lng = pt.geometry.coordinates[0][0][0];
          lat = pt.geometry.coordinates[0][0][1];
        }

        return (
          icon && (
            <Marker key={pt.id} position={[lat, lng]} icon={icon}>
              <Popup className="custom-image-popup" maxWidth={300} minWidth={260}>
                <div className="w-64 sm:w-72 overflow-hidden rounded-2xl bg-slate-950 shadow-2xl relative select-none">
                  {/* Dominant Image */}
                  <div className="relative w-full h-48 sm:h-52 bg-slate-900 flex items-center justify-center overflow-hidden">
                    {pt.mediaUrl ? (
                      pt.mediaType === 'video' ? (
                        <video
                          src={pt.mediaUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={pt.mediaUrl}
                          alt={pt.displayName}
                          className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400 p-4 text-center">
                        <Layers className="w-8 h-8 mb-1 text-slate-500" />
                        <span className="text-xs">Foto Temuan Lapangan</span>
                      </div>
                    )}

                    {/* Top Floating Badge: Tingkat Kelayakan */}
                    <div className="absolute top-2.5 left-2.5 z-10">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide backdrop-blur-md shadow-md border ${
                          pt.feasibility === 'tidak_layak'
                            ? 'bg-rose-950/85 text-rose-200 border-rose-500/50'
                            : pt.feasibility === 'cukup_layak'
                            ? 'bg-amber-950/85 text-amber-200 border-amber-500/50'
                            : 'bg-emerald-950/85 text-emerald-200 border-emerald-500/50'
                        }`}
                      >
                        {pt.feasibility === 'tidak_layak'
                          ? 'Tidak Layak'
                          : pt.feasibility === 'cukup_layak'
                          ? 'Cukup Layak'
                          : 'Layak'}
                      </span>
                    </div>

                    {/* Bottom Data Overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3.5 pt-8 text-white space-y-1.5 pointer-events-none">
                      <div className="font-bold text-sm text-white leading-tight drop-shadow-sm">
                        {pt.displayName}
                      </div>

                      <p className="text-[11px] text-slate-200 line-clamp-2 leading-relaxed drop-shadow-xs">
                        {pt.condition}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-300 pt-1.5 border-t border-white/20">
                        <span className="truncate max-w-[140px] flex items-center gap-1 font-medium" title={pt.sessionName}>
                          <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                          {pt.sessionName}
                        </span>
                        {pt.surveyorName && (
                          <span className="truncate text-slate-300 flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                            {pt.surveyorName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        );
      })}
    </MapContainer>
  );
}
