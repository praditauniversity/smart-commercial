'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Circle,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

export interface FlyToCommand {
  lat: number;
  lng: number;
  zoom: number;
  timestamp: number;
}

interface LeafletMapInnerProps {
  locationType: 'point' | 'polygon';
  point: [number, number] | null; // Survey target point
  userLocation: [number, number] | null; // Real-time GPS user position (Blue Dot)
  polygonCoords: [number, number][];
  onMapClick: (lat: number, lng: number) => void;
  onMarkerDrag?: (lat: number, lng: number) => void;
  onSetPointToUserLocation?: () => void;
  defaultCenter: [number, number];
  gpsAccuracy?: number | null;
  address?: string;
  flyToCommand?: FlyToCommand | null;
}

// Handles clicking anywhere on the map
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Controller component to smoothly fly and center map camera with size invalidation
function MapViewUpdater({
  flyToCommand,
  polygonCoords,
  locationType,
}: {
  flyToCommand?: FlyToCommand | null;
  polygonCoords: [number, number][];
  locationType: 'point' | 'polygon';
}) {
  const map = useMap();
  const lastTimestampRef = useRef<number>(0);

  // Invalidate map size on mount to avoid Leaflet tile/centering clipping
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  // Execute flyTo commands smoothly
  useEffect(() => {
    if (flyToCommand && flyToCommand.timestamp !== lastTimestampRef.current) {
      lastTimestampRef.current = flyToCommand.timestamp;
      map.invalidateSize();
      map.flyTo([flyToCommand.lat, flyToCommand.lng], flyToCommand.zoom, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [map, flyToCommand]);

  // Auto-fit polygon bounds if polygon mode
  useEffect(() => {
    if (locationType === 'polygon' && polygonCoords.length >= 3) {
      map.invalidateSize();
      const bounds = L.latLngBounds(polygonCoords);
      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 17,
        animate: true,
      });
    }
  }, [map, polygonCoords, locationType]);

  return null;
}

export default function LeafletMapInner({
  locationType,
  point,
  userLocation,
  polygonCoords,
  onMapClick,
  onMarkerDrag,
  onSetPointToUserLocation,
  defaultCenter,
  gpsAccuracy,
  address,
  flyToCommand,
}: LeafletMapInnerProps) {
  const [surveyIcon, setSurveyIcon] = useState<L.Icon | null>(null);
  const [userBeaconIcon, setUserBeaconIcon] = useState<L.DivIcon | null>(null);
  const surveyMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    // 1. Survey Target Pin: Vivid Red Marker Icon
    const redPinIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [28, 45],
      iconAnchor: [14, 45],
      popupAnchor: [1, -40],
      shadowSize: [41, 41],
    });
    setSurveyIcon(redPinIcon);

    // 2. User Current Location: Pulsing Blue Dot (Google Maps / Apple Maps style)
    const beaconIcon = L.divIcon({
      className: 'custom-user-beacon-wrapper',
      html: `
        <div class="user-location-beacon" title="Posisi Anda Saat Ini (GPS)">
          <div class="beacon-pulse"></div>
          <div class="beacon-dot"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
    setUserBeaconIcon(beaconIcon);
  }, []);

  const initialCenter = userLocation || point || (polygonCoords.length > 0 ? polygonCoords[0] : defaultCenter);

  // Calculate distance between user location (Blue Dot) and survey pin if both exist
  const distanceMeters =
    userLocation && point
      ? Math.round(L.latLng(userLocation[0], userLocation[1]).distanceTo(L.latLng(point[0], point[1])))
      : null;

  return (
    <MapContainer
      center={initialCenter}
      zoom={userLocation || point ? 17 : 14}
      scrollWheelZoom={true}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onMapClick={onMapClick} />
      <MapViewUpdater
        flyToCommand={flyToCommand}
        polygonCoords={polygonCoords}
        locationType={locationType}
      />

      {/* GPS ACCURACY RADIUS CIRCLE AROUND USER BLUE DOT */}
      {userLocation && (
        <Circle
          center={userLocation}
          radius={gpsAccuracy && gpsAccuracy > 0 ? Math.min(gpsAccuracy, 120) : 20}
          pathOptions={{
            color: '#3b82f6',
            fillColor: '#60a5fa',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '4, 4',
          }}
        />
      )}

      {/* 🔵 USER CURRENT LOCATION MARKER (BLUE DOT) */}
      {userLocation && userBeaconIcon && (
        <Marker position={userLocation} icon={userBeaconIcon} zIndexOffset={500}>
          <Popup>
            <div className="text-xs space-y-1.5 p-1 max-w-[210px]">
              <div className="flex items-center gap-1.5 font-bold text-blue-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping inline-block" />
                <span>Posisi Anda Saat Ini (GPS)</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-tight">
                Ini adalah titik patokan di mana Anda sedang berdiri saat ini.
              </p>
              {gpsAccuracy && (
                <div className="text-[10px] text-slate-500 bg-blue-50 px-2 py-1 rounded border border-blue-100 font-medium">
                  Akurasi Sensor GPS: ±{gpsAccuracy} meter
                </div>
              )}
              {onSetPointToUserLocation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetPointToUserLocation();
                  }}
                  className="w-full mt-1.5 py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold shadow-xs transition-colors cursor-pointer text-center block"
                >
                  🎯 Pasang Pin Survei di Sini
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      )}

      {/* 📍 SURVEY TARGET POINT PIN (RED PIN - DRAGGABLE) */}
      {locationType === 'point' && point && surveyIcon && (
        <Marker
          ref={surveyMarkerRef}
          position={point}
          icon={surveyIcon}
          draggable={true}
          zIndexOffset={1000}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              if (onMarkerDrag) {
                onMarkerDrag(pos.lat, pos.lng);
              } else {
                onMapClick(pos.lat, pos.lng);
              }
            },
          }}
        >
          <Popup>
            <div className="text-xs space-y-1.5 p-1 max-w-[220px]">
              <strong className="text-rose-600 block flex items-center gap-1 font-bold text-xs">
                📍 Pin Lokasi Target Survei
              </strong>
              <p className="text-slate-700 text-[11px] font-medium leading-tight break-words">
                {address || `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`}
              </p>
              {distanceMeters !== null && (
                <div className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                  📏 Jarak dari posisi Anda: ~{distanceMeters < 1000 ? `${distanceMeters} meter` : `${(distanceMeters / 1000).toFixed(2)} km`}
                </div>
              )}
              <span className="text-[10px] text-slate-400 block pt-1 border-t border-slate-100">
                💡 Sentuh & geser pin ini untuk mengatur letak objek infrastruktur yang disurvei.
              </span>
            </div>
          </Popup>
        </Marker>
      )}

      {/* 🔷 POLYGON AREA BOUNDARY */}
      {locationType === 'polygon' && polygonCoords.length > 0 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.25,
            weight: 2.5,
          }}
        />
      )}
    </MapContainer>
  );
}
