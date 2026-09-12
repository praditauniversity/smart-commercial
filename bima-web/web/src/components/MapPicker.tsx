'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Search,
  Navigation,
  Layers,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Crosshair,
  RotateCcw,
  Target,
  LocateFixed,
  Compass,
} from 'lucide-react';
import type { FlyToCommand } from './LeafletMapInner';

const LeafletMapInner = dynamic(() => import('./LeafletMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      <span className="text-xs font-medium">Memuat Peta Interaktif...</span>
    </div>
  ),
});

interface MapPickerProps {
  initialType?: 'point' | 'polygon';
  initialGeojson?: any;
  initialAddress?: string;
  onChange: (data: {
    locationType: 'point' | 'polygon';
    locationGeojson: any;
    locationAddress: string;
  }) => void;
}

export default function MapPicker({
  initialType = 'point',
  initialGeojson,
  initialAddress = '',
  onChange,
}: MapPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [locationType, setLocationType] = useState<'point' | 'polygon'>(initialType);
  
  // Target Survey Point (Red Pin)
  const [point, setPoint] = useState<[number, number] | null>(null);
  
  // Real-time User Location (Pulsing Blue Dot)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  
  const [polygonCoords, setPolygonCoords] = useState<[number, number][]>([]);
  const [address, setAddress] = useState(initialAddress);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSuccessMsg, setGpsSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Direct flyTo command controller
  const [flyToCommand, setFlyToCommand] = useState<FlyToCommand | null>(null);

  const defaultCenter: [number, number] = [-6.2088, 106.8456];

  useEffect(() => {
    setMounted(true);
    if (initialGeojson) {
      try {
        const geo = typeof initialGeojson === 'string' ? JSON.parse(initialGeojson) : initialGeojson;
        if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
          const initPt: [number, number] = [geo.coordinates[1], geo.coordinates[0]];
          setPoint(initPt);
        } else if (geo.type === 'Polygon' && Array.isArray(geo.coordinates?.[0])) {
          setPolygonCoords(geo.coordinates[0].map((c: number[]) => [c[1], c[0]]));
        }
      } catch (err) {
        console.error('Error parsing initialGeojson:', err);
      }
    } else {
      setPoint(defaultCenter);
    }

    // Auto-detect user position in background on mount if permitted
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation([lat, lng]);
          setGpsAccuracy(Math.round(pos.coords.accuracy));
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // Helper to reverse geocode lat,lng to human-readable address
  const fetchAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      if (res.ok) {
        const data = await res.json();
        return data.display_name || `Koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    } catch {}
    return `Koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };

  // Map Click Handler: Moves survey pin (or adds polygon point)
  const handleMapClick = async (lat: number, lng: number) => {
    setErrorMsg(null);

    if (locationType === 'point') {
      setPoint([lat, lng]);
      const geojson = { type: 'Point', coordinates: [lng, lat] };

      const addr = await fetchAddressFromCoords(lat, lng);
      setAddress(addr);
      onChange({ locationType: 'point', locationGeojson: geojson, locationAddress: addr });
    } else {
      const updated = [...polygonCoords, [lat, lng] as [number, number]];
      setPolygonCoords(updated);
      if (updated.length >= 3) {
        const closed = [...updated, updated[0]];
        const geojson = {
          type: 'Polygon',
          coordinates: [closed.map(([plat, plng]) => [plng, plat])],
        };
        onChange({
          locationType: 'polygon',
          locationGeojson: geojson,
          locationAddress: address || `Area Poligon (${updated.length} titik)`,
        });
      }
    }
  };

  // Marker Drag Handler: Fine-tuning survey pin
  const handleMarkerDrag = async (lat: number, lng: number) => {
    setErrorMsg(null);
    setPoint([lat, lng]);
    const geojson = { type: 'Point', coordinates: [lng, lat] };
    const addr = await fetchAddressFromCoords(lat, lng);
    setAddress(addr);
    onChange({ locationType: 'point', locationGeojson: geojson, locationAddress: addr });
  };

  // GPS Trigger: Centers camera on user, sets Blue Dot and places/syncs survey pin
  const handleGpsAutofill = () => {
    setErrorMsg(null);
    setGpsSuccessMsg(null);

    if (!navigator.geolocation) {
      setErrorMsg('Perangkat Anda tidak mendukung fitur deteksi GPS otomatis. Silakan cari alamat atau klik pada peta.');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGpsLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        setUserLocation([lat, lng]);
        setGpsAccuracy(accuracy);
        setPoint([lat, lng]);
        setLocationType('point');

        // Trigger immediate smooth fly-to at street level (zoom 17)
        setFlyToCommand({
          lat,
          lng,
          zoom: 17,
          timestamp: Date.now(),
        });

        const addr = await fetchAddressFromCoords(lat, lng);
        setAddress(addr);
        setGpsSuccessMsg(`GPS aktif: Titik biru menandai posisi Anda. Kamera telah difokuskan ke lokasi Anda.`);

        onChange({
          locationType: 'point',
          locationGeojson: { type: 'Point', coordinates: [lng, lat] },
          locationAddress: addr,
        });
      },
      (err) => {
        setGpsLoading(false);
        console.warn('GPS error:', err);
        let msg = 'Izin lokasi belum diberikan. Pastikan GPS aktif di browser / ponsel Anda.';
        if (err.code === 1) {
          msg = 'Izin akses lokasi (GPS) ditolak oleh browser. Silakan aktifkan izin lokasi atau gunakan pencarian alamat.';
        } else if (err.code === 2) {
          msg = 'Sinyal GPS tidak terdeteksi. Silakan coba beberapa saat lagi atau klik pada peta secara manual.';
        } else if (err.code === 3) {
          msg = 'Waktu permintaan GPS habis. Silakan coba tekan tombol GPS Saya sekali lagi.';
        }
        setErrorMsg(msg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Set survey target pin directly onto user's current GPS position
  const handleSetPointToUserLocation = async () => {
    if (!userLocation) {
      handleGpsAutofill();
      return;
    }
    const [lat, lng] = userLocation;
    setPoint([lat, lng]);
    setLocationType('point');
    setFlyToCommand({
      lat,
      lng,
      zoom: 17,
      timestamp: Date.now(),
    });

    const addr = await fetchAddressFromCoords(lat, lng);
    setAddress(addr);
    setGpsSuccessMsg('Pin survei merah telah ditempatkan tepat di posisi titik biru Anda.');
    onChange({
      locationType: 'point',
      locationGeojson: { type: 'Point', coordinates: [lng, lat] },
      locationAddress: addr,
    });
  };

  // Focus map camera to User Blue Dot
  const handleFocusUserLocation = () => {
    if (userLocation) {
      setFlyToCommand({
        lat: userLocation[0],
        lng: userLocation[1],
        zoom: 17,
        timestamp: Date.now(),
      });
    } else {
      handleGpsAutofill();
    }
  };

  // Focus map camera to Survey Target Pin
  const handleFocusSurveyPin = () => {
    if (point) {
      setFlyToCommand({
        lat: point[0],
        lng: point[1],
        zoom: 17,
        timestamp: Date.now(),
      });
    }
  };

  const handleSearchAddress = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setErrorMsg(null);
    setGpsSuccessMsg(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          const addr = results[0].display_name;

          setPoint([lat, lng]);
          setLocationType('point');
          setFlyToCommand({
            lat,
            lng,
            zoom: 17,
            timestamp: Date.now(),
          });
          setAddress(addr);

          onChange({
            locationType: 'point',
            locationGeojson: { type: 'Point', coordinates: [lng, lat] },
            locationAddress: addr,
          });
        } else {
          setErrorMsg('Alamat tidak ditemukan. Coba ketik nama jalan, gedung, atau kelurahan yang lebih spesifik.');
        }
      }
    } catch {
      setErrorMsg('Gagal mencari alamat. Periksa koneksi internet Anda.');
    } finally {
      setSearching(false);
    }
  };

  const resetPolygon = () => {
    setPolygonCoords([]);
    onChange({
      locationType: 'polygon',
      locationGeojson: {},
      locationAddress: address,
    });
  };

  // Calculate distance between user location (Blue Dot) and survey pin
  const distanceMeters =
    userLocation && point
      ? Math.round(
          // Approximate Haversine
          6371000 *
            2 *
            Math.asin(
              Math.sqrt(
                Math.sin(((point[0] - userLocation[0]) * Math.PI) / 360) ** 2 +
                  Math.cos((userLocation[0] * Math.PI) / 180) *
                    Math.cos((point[0] * Math.PI) / 180) *
                    Math.sin(((point[1] - userLocation[1]) * Math.PI) / 360) ** 2
              )
            )
        )
      : null;

  if (!mounted) {
    return (
      <div className="w-full h-72 sm:h-84 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search and GPS Action Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search Input */}
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari jalan / gedung / kelurahan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchAddress(e);
                }
              }}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
          </div>
          <button
            type="button"
            onClick={handleSearchAddress}
            disabled={searching}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cari'}
          </button>
        </div>

        {/* GPS Button and Mode Switcher */}
        <div className="flex gap-2 justify-between sm:justify-start">
          <button
            type="button"
            onClick={handleGpsAutofill}
            disabled={gpsLoading}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
            title="Aktifkan GPS: Tampilkan titik biru posisi saya & fokuskan kamera"
          >
            {gpsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Mencari GPS...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 text-white" />
                <span>GPS Saya</span>
              </>
            )}
          </button>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLocationType('point');
                onChange({
                  locationType: 'point',
                  locationGeojson: point ? { type: 'Point', coordinates: [point[1], point[0]] } : {},
                  locationAddress: address,
                });
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                locationType === 'point' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Titik
            </button>
            <button
              type="button"
              onClick={() => {
                setLocationType('polygon');
                onChange({
                  locationType: 'polygon',
                  locationGeojson:
                    polygonCoords.length >= 3
                      ? {
                          type: 'Polygon',
                          coordinates: [
                            [...polygonCoords, polygonCoords[0]].map(([lat, lng]) => [lng, lat]),
                          ],
                        }
                      : {},
                  locationAddress: address,
                });
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                locationType === 'polygon' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Area (Polygon)
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Feedback Banner */}
      {gpsSuccessMsg && (
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
            <span className="font-medium">{gpsSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={handleFocusUserLocation}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-all"
          >
            Fokuskan
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Interactive Map Canvas */}
      <div className="relative w-full h-72 sm:h-88 rounded-2xl overflow-hidden border border-slate-300 shadow-sm bg-slate-100">
        <LeafletMapInner
          locationType={locationType}
          point={point}
          userLocation={userLocation}
          polygonCoords={polygonCoords}
          onMapClick={handleMapClick}
          onMarkerDrag={handleMarkerDrag}
          onSetPointToUserLocation={handleSetPointToUserLocation}
          defaultCenter={defaultCenter}
          gpsAccuracy={gpsAccuracy}
          address={address}
          flyToCommand={flyToCommand}
        />

        {/* FLOATING ACTION BUTTONS (TOP-RIGHT) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 items-end">
          {/* Button: Focus to User Blue Dot */}
          {userLocation && (
            <button
              type="button"
              onClick={handleFocusUserLocation}
              title="Pusatkan kamera tepat ke Titik Biru posisi Anda saat ini"
              className="px-3 py-1.5 bg-white/95 hover:bg-white text-blue-700 active:scale-95 text-xs font-bold rounded-xl shadow-md border border-blue-200 flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5 text-blue-600" />
              <span>Posisi Saya (🔵)</span>
            </button>
          )}

          {/* Button: Focus to Survey Pin */}
          {point && locationType === 'point' && (
            <button
              type="button"
              onClick={handleFocusSurveyPin}
              title="Pusatkan kamera tepat ke Pin Merah target survei"
              className="px-3 py-1.5 bg-white/95 hover:bg-white text-rose-700 active:scale-95 text-xs font-bold rounded-xl shadow-md border border-rose-200 flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
            >
              <Target className="w-3.5 h-3.5 text-rose-600" />
              <span>Target Pin (🔴)</span>
            </button>
          )}
        </div>

        {/* FLOATING LEGEND & USER GUIDE (BOTTOM-LEFT) */}
        <div className="absolute bottom-2 left-2 right-2 sm:right-auto z-20 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-[11px] sm:text-xs shadow-md space-y-1 max-w-sm">
          {locationType === 'point' ? (
            <div>
              <div className="flex items-center gap-3 flex-wrap text-[11px] font-semibold pb-1 border-b border-slate-100">
                <span className="flex items-center gap-1 text-blue-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-xs" />
                  Titik Biru: Posisi Anda
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shadow-xs" />
                  Pin Merah: Lokasi Survei
                </span>
              </div>
              <p className="text-[10px] text-slate-500 pt-1 leading-tight">
                💡 Sentuh/klik peta atau geser pin merah ke objek yang disurvei.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                Klik titik berurutan untuk area poligon ({polygonCoords.length} titik).
              </span>
              {polygonCoords.length > 0 && (
                <button
                  type="button"
                  onClick={resetPolygon}
                  className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-md font-bold text-xs shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SELECTED ADDRESS & DISTANCE DISPLAY CARD */}
      {address && (
        <div className="text-xs text-slate-700 bg-white p-3.5 rounded-2xl border border-slate-200 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg shrink-0 mt-0.5 border border-rose-100">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Target Lokasi Survei
                </span>
                {distanceMeters !== null && (
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                    📏 Jarak dari posisi Anda: ~{distanceMeters < 1000 ? `${distanceMeters} meter` : `${(distanceMeters / 1000).toFixed(2)} km`}
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-900 mt-1 leading-snug break-words">
                {address}
              </p>
            </div>
          </div>

          {userLocation && point && (
            <button
              type="button"
              onClick={handleSetPointToUserLocation}
              className="hidden sm:flex px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold shrink-0 items-center gap-1 transition-all cursor-pointer"
              title="Letakkan pin merah sama persis di titik biru posisi Anda"
            >
              <Crosshair className="w-3 h-3" />
              <span>Samakan ke Posisi Saya</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
