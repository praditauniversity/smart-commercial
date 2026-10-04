# Arsitektur

## 1. Gambaran umum

```
 Browser (surveyor / admin)
        │  HTTPS (cookie httpOnly bima_session)
        ▼
┌─────────────────────────────────────────┐        ┌──────────────────────────┐
│ web/  Next.js 16 (App Router)           │        │ Supabase                 │
│  • UI (React 19, Tailwind, Leaflet)     │◀──────▶│  • PostgreSQL (Prisma)   │
│  • API routes (/api/*)                  │        │  • Storage (img, vids)   │
│  • Auth JWT + bcrypt, state machine     │        └──────────────────────────┘
│  • Kompresi media (ffmpeg+ffprobe)      │                     ▲
└───────────────┬─────────────────────────┘                     │ REST (hasil anotasi SAM3)
                │ HTTP + X-Internal-Secret                       │
                │ (server-ke-server, loopback)                   │
                ▼                                                │
┌─────────────────────────────────────────┐                     │
│ ai-service/  FastAPI (127.0.0.1:8000)   │─────────────────────┘
│  • VLM: OpenRouter / on-premise         │
│  • SAM3 lokal (GPU) sebagai job         │──▶ OpenRouter / endpoint on-premise
│  • Dedup temporal, deteksi konflik      │
└─────────────────────────────────────────┘
```

Prinsip yang dijaga:

1. **Browser hanya berbicara dengan Next.js.** FastAPI tidak pernah dipanggil dari browser. Ia hanya mendengarkan `127.0.0.1:8000` dan menolak request tanpa header `X-Internal-Secret` yang cocok.
2. **Next.js adalah satu-satunya penulis database.** FastAPI mengembalikan hasil, Next.js yang menyimpan `MediaSegment` dan `Detection` dalam satu transaksi.
3. **Aturan bisnis (state machine, guard submit, hak akses) ada di Next.js.** FastAPI tidak mengetahui sesi, user, atau status review.
4. **Semua provider AI diseragamkan** menjadi `DetectionSchema` sebelum sampai ke Next.js.

## 2. Komponen

### 2.1 `web/` (Next.js)

| Area | Lokasi | Catatan |
|---|---|---|
| Halaman surveyor | `src/app/surveyor/` | Daftar sesi, buat sesi, detail sesi (tab Findings / Media / History) |
| Halaman admin | `src/app/admin/` | `dashboard`, `reviews`, `classes`, `models`, `users` |
| Login dan beranda | `src/app/login`, `src/app/page.tsx` | Beranda mengarahkan berdasar role setelah `GET /api/auth/me` |
| API | `src/app/api/**/route.ts` | Lihat [`api-reference.md`](api-reference.md) |
| State machine | `src/lib/state-machine.ts` | Validasi transisi sesi dan media |
| Auth | `src/lib/auth.ts`, `src/lib/security.ts` | `requireAuth(roles?)`, JWT, enkripsi secret |
| Storage | `src/lib/media-storage.ts` | Kompres ffmpeg, upload/hapus di Supabase |
| Runner SAM3 | `src/lib/sam3-runner.ts` | Membuat job di FastAPI, polling, menyimpan hasil |
| Cache kelas | `src/lib/classCache.ts` | Cache daftar kelas, di-invalidate saat kelas berubah |
| Prisma | `src/lib/prisma.ts`, `prisma/schema.prisma` | Klien tunggal dan skema |
| Komponen | `src/components/` | Peta, inspeksi media, overlay bbox, hasil SAM3, audit timeline |

### 2.2 `ai-service/` (FastAPI)

| File | Fungsi |
|---|---|
| `main.py` | Aplikasi FastAPI, autentikasi internal, endpoint (lihat referensi API) |
| `schemas.py` | Model Pydantic (`DetectionSchema`, `ProcessMediaRequest`, dll.) |
| `providers/base.py`, `openrouter.py`, `onpremise.py`, `mock.py` | Abstraksi provider VLM |
| `services/sam3_service.py` | Menjalankan job SAM3 untuk satu media |
| `services/sam3_engine.py` | Mesin SAM3 (model, segmentasi gambar/video, anotasi, ffmpeg) |
| `services/storage.py` | Upload video anotasi ke Supabase Storage |
| `services/deduplication.py` | IoU dan dedup temporal |
| `services/conflict_detector.py` | Konflik kelas saling eksklusif |
| `services/video_splitter.py` | Perencanaan segmen ≤10 detik |
| `services/visual_grid.py` | Overlay grid visual untuk membantu VLM (dipakai tes) |

### 2.3 Dependensi eksternal

| Layanan | Dipakai untuk | Konfigurasi |
|---|---|---|
| Supabase PostgreSQL | Semua data aplikasi | `DATABASE_URL`, `DIRECT_URL`; local Docker uses the private `supabase-db` network alias |
| Supabase Storage | Media terkompresi, video anotasi | `SUPABASE_INTERNAL_URL` for service uploads; `NEXT_PUBLIC_SUPABASE_URL` for browser URLs; buckets `img`, `vids` (public) |
| OpenRouter | VLM (Qwen3 VL 8B dan lainnya) | API key per konfigurasi model, atau `OPEN_ROUTER_API_KEY` sebagai bootstrap |
| OpenStreetMap tiles + Nominatim | Peta dan geocoding | Tanpa key; ikuti kebijakan penggunaan Nominatim |
| GPU + bobot SAM 3.1 | Provider `sam3` | `SAM3_CHECKPOINT`, torch, ultralytics |

## 3. Autentikasi dan otorisasi

- Login: `POST /api/auth/login` memeriksa `User.passwordHash` (bcrypt) dan `isActive`, lalu menerbitkan JWT HS256 (umur dari `SESSION_MAX_AGE_SECONDS`) di cookie `bima_session` (`httpOnly`, `sameSite=lax`, `secure` di production).
- Tiap request API memanggil `requireAuth(['admin'])` atau `requireAuth()`; peran ada di payload JWT dan divalidasi ulang terhadap database dengan cache selama `USER_CACHE_TTL_MS` (`isActive` dicek). Jika database tidak dapat dijangkau, payload JWT yang valid dipakai apa adanya.
- Role: `surveyor` hanya mengakses sesi miliknya; `admin` mengakses semua sesi dan endpoint `/api/admin/*`.
- **Proteksi halaman:** `web/src/proxy.ts` (nama baru `middleware` di Next.js 16) berjalan di depan `/admin/*` dan `/surveyor/*`. Tanpa JWT valid → redirect ke `/login` (cookie rusak ikut dihapus); role `surveyor` yang membuka `/admin/*` → redirect ke `/surveyor/sessions`. Proxy hanya memeriksa tanda tangan dan masa berlaku token; pemeriksaan `isActive` ke database tetap dilakukan API lewat `requireAuth()`. URL redirect dibentuk dari header `X-Forwarded-Host`/`X-Forwarded-Proto` agar benar di belakang Tailscale Serve.
- **`JWT_SECRET` wajib dari environment**, tanpa nilai bawaan. Jika kosong, login dan proxy gagal dengan pesan jelas. Rahasia yang pernah tercantum di kode atau riwayat git harus dianggap bocor.
- Karena cookie bertanda `Secure` pada production, **login hanya bekerja lewat HTTPS** (atau `localhost`). Lihat [`operations.md`](operations.md).

## 4. Alur data utama

### 4.1 Lifecycle sesi survei

Lihat diagram state machine di PRD bagian 4. Logika di `web/src/lib/state-machine.ts`; route yang memakainya: `sessions/[id]/end`, `submit`, `create-revision`, `resubmit`, dan `admin/reviews/[id]/approve|reject`.

### 4.2 Upload sampai hasil deteksi

```
Surveyor            Next.js                          Supabase           FastAPI
   │ POST /media/upload (multipart)                       │                │
   ├────────────────▶ validasi sesi + status              │                │
   │                 video: ffprobe, tolak bila > 20 menit │                │
   │                 ffmpeg kompres (WebP / H.264)        │                │
   │                 upload ke bucket ───────────────────▶│                │
   │                 INSERT MediaAsset(status=uploaded)   │                │
   │◀────────────────  { mediaAsset }                     │                │
   │ POST /media/{id}/process                              │                │
   ├────────────────▶ status=processing                    │                │
   │                 pilih model default aktif             │                │
   │                                                       │                │
   │   ── provider = sam3 ──                               │                │
   │◀── 202 ─────────  runSam3Job (background)             │                │
   │                   POST /api/v1/sam3/jobs ─────────────────────────────▶│ antre di 1 worker
   │                   GET  /api/v1/sam3/jobs/{id} (3 dtk) ───────────────▶│ progres/hasil
   │                   (video anotasi diunggah) ◀───────────────────────────┤ upload ke `vids`
   │                   transaksi: hapus data lama, tulis segmen + detection │
   │                   status=completed | failed                            │
   │                                                                        │
   │   ── provider = OpenRouter / onpremise ──                              │
   │                   POST /api/v1/process-media ─────────────────────────▶│ unduh media, panggil VLM,
   │                   ◀───────────────────────────────────────────────────┤ dedup, deteksi konflik
   │◀── hasil ───────  transaksi: hapus data lama, tulis segmen + detection │
   │  (UI polling media berstatus processing)                               │
```

Perilaku penting:

- Setiap pemrosesan **menghapus dan menulis ulang** `Detection`/`MediaSegment` milik media itu dalam satu transaksi. Inilah dasar idempotensi retry.
- Job SAM3 dijalankan **di dalam proses Next.js** (`void runSam3Job(...)`) dan status job disimpan **di memori FastAPI**. Jika salah satu proses restart saat job berjalan, media tetap `processing` (Next restart) atau menjadi `failed` (FastAPI restart → job 404). Belum ada sapuan pemulihan. Lihat [`operations.md`](operations.md) bagian restart.

### 4.3 Review dan dashboard

`admin/reviews` membaca `SubmissionVersion` (dan sesinya). Kartu temuan pada halaman review dibangun dari **snapshot** (`snapshotData`), sedangkan modal inspeksi dan koreksi memakai baris **`Detection` hidup**. Koreksi admin mengubah baris `Detection` dan menulis `AuditLog`. Dashboard menghitung dari `Detection` pada sesi berstatus `disetujui`. Kartu temuan (surveyor dan admin) dipaginasi 12 per halaman di browser.

## 5. Storage

- Bucket publik `img` (gambar, WebP) dan `vids` (video H.264 dan video anotasi).
- Path objek: `sessions/{sessionId}/{uuid}.{ext}`; hasil anotasi SAM3: `sessions/{sessionId}/sam3-{uuid}.mp4`.
- Kompresi: gambar sisi terpanjang ≤1280 px (hanya diperkecil), WebP kualitas 65; video tinggi ≤720 px, H.264 CRF 30, tanpa audio, `faststart`.
- **File asli tidak disimpan** (keputusan produk K7). Hanya versi terkompresi.
- **Durasi video maksimal 20 menit** (default 120 detik; dapat diatur admin di menu Batas Media). Diukur `ffprobe` di server sebelum kompresi (HTTP 400 bila melebihi atau tidak terbaca) dan dicek di browser sebelum upload.
- Penghapusan media menghapus objek di bucket (`removeStoredFile`); URL non-Supabase (data lama `/uploads/...`) diabaikan.

## 6. Konfigurasi

Variabel lingkungan lengkap ada di [`operations.md`](operations.md#variabel-lingkungan).

## 7. Keputusan arsitektur yang perlu diketahui

| Keputusan | Alasan | Konsekuensi |
|---|---|---|
| Auth buatan sendiri (bukan Supabase Auth), keputusan K1 | Kontrol penuh atas role dan alur login | Kita menjaga JWT/secret sendiri; PRD sudah diperbarui |
| Upload melewati Next.js | Kompresi ffmpeg terpusat sebelum simpan | Batas ukuran body dan memori server; PRD lama meminta upload langsung ke Storage |
| Next.js sebagai penulis DB tunggal | Skema dan aturan bisnis satu tempat | FastAPI tidak menyimpan hasil; job harus dipoll |
| Job SAM3 satu worker + status di memori | GPU tunggal dan sederhana | Antrean serial; job hilang saat restart |
| Field JSON disimpan sebagai `String` | Portabilitas awal | Tidak bisa di-query dengan operator JSON |
