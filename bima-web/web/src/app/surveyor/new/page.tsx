'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MapPicker from '@/components/MapPicker';
import { useToast } from '@/components/ToastProvider';
import { EXPOSURE_LABEL, type Exposure } from '@/lib/risk';
import { MapPin, Calendar, FileText, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function NewSurveySessionPage() {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [surveyDate, setSurveyDate] = useState(new Date().toISOString().split('T')[0]);
  const [locationType, setLocationType] = useState<'point' | 'polygon'>('point');
  const [locationGeojson, setLocationGeojson] = useState<any>({
    type: 'Point',
    coordinates: [106.8456, -6.2088],
  });
  const [locationAddress, setLocationAddress] = useState('');
  const [zones, setZones] = useState<{ id: string; name: string; exposure: number; isSimulated: boolean }[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/zones')
      .then((r) => r.json())
      .then((j) => setZones(j.zones || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama survei wajib diisi.');
      toast.warning('Nama survei wajib diisi.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          locationType,
          locationGeojson,
          locationAddress,
          surveyDate,
          zoneId: zoneId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat sesi survei.');
      }

      toast.success('Sesi survei baru berhasil dibuat!', 'Sesi Dimulai');
      router.push(`/surveyor/sessions/${data.session.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error(err.message || 'Gagal membuat sesi survei.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dashboard-bg flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-zinc-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 bg-brand-green/10 rounded-lg shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-green" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-900">Buat Sesi Survei Baru</h1>
                <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
                  Tentukan nama, tanggal, dan titik/area pemantauan kawasan di lapangan.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {error && (
              <div className="p-3 sm:p-4 bg-rose-50 border border-rose-200 rounded-md text-rose-800 text-xs sm:text-sm flex items-center gap-3">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Survey Name */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-900">
                  Nama Survei <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Survei Jalan Protokol Sudirman"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-white border border-zinc-200 rounded-md text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-colors"
                  />
                </div>
              </div>

              {/* Survey Date */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-900">
                  Tanggal Survei <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="date"
                    required
                    value={surveyDate}
                    onChange={(e) => setSurveyDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-white border border-zinc-200 rounded-md text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-colors"
                  />
                </div>
              </div>

              {/* Zone -> Exposure */}
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="zone" className="block text-sm font-medium text-zinc-900">
                  Zona Kawasan (menentukan Tingkat Paparan)
                </label>
                <select
                  id="zone"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 bg-white border border-zinc-200 rounded-md text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-colors"
                >
                  <option value="">Tanpa zona — temuan belum diberi skor risiko</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — Paparan {EXPOSURE_LABEL[z.exposure as Exposure]} ({z.exposure})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Map Picker */}
            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="block text-sm font-medium text-zinc-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-brand-green" />
                Pilih Lokasi Pemantauan (OpenStreetMap)
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Gunakan pencarian alamat, tombol GPS, atau klik peta secara langsung.
              </p>

              <MapPicker
                initialType={locationType}
                initialGeojson={locationGeojson}
                initialAddress={locationAddress}
                onChange={(res) => {
                  setLocationType(res.locationType);
                  setLocationGeojson(res.locationGeojson);
                  setLocationAddress(res.locationAddress);
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => router.push('/surveyor/sessions')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-white border border-zinc-200 text-zinc-900 font-medium text-sm shadow-sm hover:bg-zinc-50 active:scale-95 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-brand-green hover:bg-brand-green/90 active:scale-95 text-white font-medium text-sm shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Membuat Sesi...
                  </>
                ) : (
                  <>
                    Mulai Sesi Survei
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
