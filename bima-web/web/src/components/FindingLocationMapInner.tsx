'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Popup, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

interface FindingLocationMapInnerProps {
  sessionLocationType: 'point' | 'polygon';
  sessionGeojson: any;
  findingPoint: [number, number] | null;
  canEdit: boolean;
  onPointChange: (newPoint: [number, number], newGeojson: { type: string; coordinates: [number, number] }) => void;
  flyToPoint?: [number, number] | null;
  onOutsideArea?: () => void;
}

function isPointInsidePolygonBounds(
  point: [number, number],
  polygonCoords: [number, number][]
): boolean {
  if (polygonCoords.length < 3) return true;
  const latlngs = polygonCoords.map(([lat, lng]) => L.latLng(lat, lng));
  const poly = L.polygon(latlngs);
  const bounds = poly.getBounds();
  return bounds.contains(L.latLng(point[0], point[1]));
}

function MapEventsHandler({
  canEdit,
  onPointChange,
  polygonCoords,
  onOutsideArea,
}: {
  canEdit: boolean;
  onPointChange: (newPoint: [number, number], newGeojson: { type: string; coordinates: [number, number] }) => void;
  polygonCoords: [number, number][];
  onOutsideArea: () => void;
}) {
  useMapEvents({
    click(e) {
      if (!canEdit) return;
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      if (polygonCoords.length >= 3 && !isPointInsidePolygonBounds([lat, lng], polygonCoords)) {
        onOutsideArea();
        return;
      }
      onPointChange([lat, lng], { type: 'Point', coordinates: [lng, lat] });
    },
  });
  return null;
}

function MapAutoBounds({
  polygonCoords,
  point,
}: {
  polygonCoords: [number, number][];
  point: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (polygonCoords && polygonCoords.length >= 3) {
      const bounds = L.latLngBounds(polygonCoords);
      if (point) bounds.extend(point);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
    } else if (point) {
      map.setView(point, 16);
    }
  }, [map]);
  return null;
}

function MapFlyTo({ flyTo }: { flyTo: [number, number] | null }) {
  const map = useMap();
  const prevFlyTo = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!flyTo) return;
    if (
      prevFlyTo.current &&
      Math.abs(flyTo[0] - prevFlyTo.current[0]) < 0.000001 &&
      Math.abs(flyTo[1] - prevFlyTo.current[1]) < 0.000001
    ) return;
    prevFlyTo.current = flyTo;
    map.flyTo(flyTo, 18, { duration: 1.2 });
  }, [flyTo, map]);
  return null;
}

// CSS shake animation injected once
const SHAKE_STYLE_ID = 'finding-map-shake-style';
function injectShakeStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHAKE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHAKE_STYLE_ID;
  style.textContent = `
    @keyframes markerShake {
      0%   { transform: translateX(0);    }
      15%  { transform: translateX(-8px); }
      30%  { transform: translateX(8px);  }
      45%  { transform: translateX(-6px); }
      60%  { transform: translateX(6px);  }
      75%  { transform: translateX(-4px); }
      90%  { transform: translateX(4px);  }
      100% { transform: translateX(0);    }
    }
    .marker-shake img {
      animation: markerShake 0.55s ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

export default function FindingLocationMapInner({
  sessionLocationType,
  sessionGeojson,
  findingPoint,
  canEdit,
  onPointChange,
  flyToPoint = null,
  onOutsideArea,
}: FindingLocationMapInnerProps) {
  const [findingIcon, setFindingIcon] = useState<L.Icon | null>(null);
  const [showOutsideWarning, setShowOutsideWarning] = useState(false);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    injectShakeStyle();
    const customIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    setFindingIcon(customIcon);
  }, []);

  const triggerShake = () => {
    setShowOutsideWarning(true);
    // Apply shake class to leaflet marker DOM element
    const markerEl = markerRef.current?._icon;
    if (markerEl) {
      markerEl.classList.remove('marker-shake');
      void markerEl.offsetWidth; // force reflow to restart animation
      markerEl.classList.add('marker-shake');
      setTimeout(() => markerEl.classList.remove('marker-shake'), 600);
    }
    setTimeout(() => setShowOutsideWarning(false), 2500);
    onOutsideArea?.();
  };

  const { sessionPolygonCoords, sessionDefaultCenter } = useMemo(() => {
    let polygonCoords: [number, number][] = [];
    let defaultCenter: [number, number] = [-6.2088, 106.8456];
    if (sessionGeojson) {
      try {
        const geo = typeof sessionGeojson === 'string' ? JSON.parse(sessionGeojson) : sessionGeojson;
        if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
          polygonCoords = geo.coordinates[0].map((c: number[]) => [c[1], c[0]]);
          if (polygonCoords.length > 0) defaultCenter = polygonCoords[0];
        } else if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
          defaultCenter = [geo.coordinates[1], geo.coordinates[0]];
        }
      } catch {}
    }
    return { sessionPolygonCoords: polygonCoords, sessionDefaultCenter: defaultCenter };
  }, [sessionGeojson]);

  const activePoint = findingPoint || sessionDefaultCenter;

  const eventHandlers = useMemo(
    () => ({
      dragend(e: any) {
        if (!canEdit) return;
        const marker = e.target;
        const position = marker.getLatLng();
        const lat = position.lat;
        const lng = position.lng;
        if (sessionPolygonCoords.length >= 3 && !isPointInsidePolygonBounds([lat, lng], sessionPolygonCoords)) {
          if (findingPoint) marker.setLatLng(L.latLng(findingPoint[0], findingPoint[1]));
          triggerShake();
          return;
        }
        onPointChange([lat, lng], { type: 'Point', coordinates: [lng, lat] });
      },
    }),
    [canEdit, onPointChange, sessionPolygonCoords, findingPoint]
  );

  return (
    <MapContainer
      center={activePoint}
      zoom={16}
      scrollWheelZoom={true}
      style={{ width: '100%', height: '100%', borderRadius: '0.75rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapEventsHandler
        canEdit={canEdit}
        onPointChange={onPointChange}
        polygonCoords={sessionPolygonCoords}
        onOutsideArea={triggerShake}
      />
      <MapAutoBounds polygonCoords={sessionPolygonCoords} point={findingPoint} />
      <MapFlyTo flyTo={flyToPoint} />

      {sessionLocationType === 'polygon' && sessionPolygonCoords.length >= 3 && (
        <Polygon
          positions={sessionPolygonCoords}
          pathOptions={{
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.18,
            weight: 2.5,
            dashArray: '5, 5',
          }}
        >
          <Tooltip sticky direction="top" className="font-semibold text-xs text-blue-800">
            Area Batas Survei Sesi (Ditetapkan di Awal - Tidak Dapat Diubah)
          </Tooltip>
        </Polygon>
      )}

      {activePoint && findingIcon && (
        <Marker
          key={`finding-pin-${activePoint[0].toFixed(5)}-${activePoint[1].toFixed(5)}`}
          position={activePoint}
          icon={findingIcon}
          draggable={canEdit}
          eventHandlers={eventHandlers}
          ref={markerRef}
        >
          {/* Warning tooltip when outside area */}
          {showOutsideWarning ? (
            <Tooltip direction="top" permanent offset={[0, -45]}>
              <div style={{ background: '#dc2626', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                ⛔ Di luar area survei
              </div>
            </Tooltip>
          ) : (
            <Popup>
              <div className="text-xs space-y-1">
                <strong className="block text-slate-900 font-bold">Titik Lokasi Temuan Objek</strong>
                <div className="text-slate-600 font-mono text-[11px]">
                  Lat: {activePoint[0].toFixed(6)}, Lng: {activePoint[1].toFixed(6)}
                </div>
                {canEdit && (
                  <div className="text-blue-600 font-medium text-[10px] mt-1">
                    Geser pin ini atau klik peta untuk memindahkan titik temuan.
                  </div>
                )}
              </div>
            </Popup>
          )}
        </Marker>
      )}
    </MapContainer>
  );
}
