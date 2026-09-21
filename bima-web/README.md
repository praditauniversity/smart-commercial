# AI Vision Pemantauan Kawasan (Research & Web Platform)

Aplikasi Web Pemantauan Kawasan Terintegrasi AI Vision (BIMA Vision) untuk survei kondisi infrastruktur: surveyor mengumpulkan gambar/video dalam sesi survei, AI (VLM via OpenRouter/on-premise, atau SAM3 lokal) mendeteksi objek dan kondisinya, admin mereview lalu menyetujui atau menolak hasilnya.

📄 **Dokumentasi lengkap:** [`docs/README.md`](docs/README.md) · **PRD:** [`PRD_ Aplikasi Web AI Pemantauan Kawasan.md`](PRD_%20Aplikasi%20Web%20AI%20Pemantauan%20Kawasan.md)

---

## 🏗️ Struktur Project

```
├── web/           # Next.js 16 (App Router) + React 19 + Tailwind + Prisma + Supabase
├── ai-service/    # Python 3.10+ FastAPI (VLM, SAM3 lokal, Deduplication, Deteksi Konflik)
├── docs/          # Arsitektur, model data, API, operasional, gap analysis, code review
└── PRD_ ....md    # PRD v2.0 (status implementasi per kebutuhan)
```

---

## 🚀 Panduan Setup untuk Tim / Kolaborator Baru

### 1. Clone Repository
```bash
git clone <URL_REPO_GITHUB>
cd bima-web
```

---

### 2. Setup AI Service (Python / FastAPI)

Buka terminal pertama:

```bash
cd ai-service

# 1. Buat virtual environment (venv)
python -m venv venv

# 2. Aktifkan virtual environment
# Di Windows (CMD / PowerShell):
venv\Scripts\activate
# Di macOS / Linux:
# source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Buat file .env
copy .env.example .env     # di Windows
# cp .env.example .env     # di Linux / Mac

# 5. Jalankan server FastAPI
python main.py            # atau: uvicorn main:app --reload --port 8000
```
> Service menolak start bila `INTERNAL_API_SECRET` kosong.
> Provider SAM3 (opsional) membutuhkan GPU, torch, ultralytics, dan bobot SAM 3.1 — lihat [`docs/ai-service.md`](docs/ai-service.md).
> Server AI Service akan berjalan di `http://127.0.0.1:8000`.  
> API docs Swagger dapat diakses di `http://127.0.0.1:8000/docs`.

---

### 3. Setup Web Application (Next.js)

Buka terminal kedua:

```bash
cd web

# 1. Install Node modules
npm install

# 2. Buat file .env
copy .env.example .env     # di Windows
# cp .env.example .env     # di Linux / Mac

# 3. Sesuaikan variabel .env (Database Supabase / Postgres & Secret)
# Pastikan INTERNAL_API_SECRET di web/.env sama dengan di ai-service/.env

# 4. Generate Prisma Client
npx prisma generate

# 5. Terapkan migrasi dan isi data awal
# npx prisma migrate deploy
# npm run seed          # akun, kelas awal, model default
# npm run seed:sam3     # opsional: SAM prompt dan model SAM3

# 6. Jalankan server Next.js development
npm run dev
```
> Web application akan berjalan di `http://localhost:3000`.
>
> **Production / server tetap:** gunakan `npm run build && npm start` (atau service systemd). Cookie login bertanda `Secure` di production, sehingga login **wajib lewat HTTPS** (atau `localhost`). Panduan deploy dan akses jarak jauh via Tailscale: [`docs/operations.md`](docs/operations.md).

---

### 4. Menjalankan Test

- **AI Service Test**:
  ```bash
  cd ai-service
  pytest
  ```
- **Web Typecheck & Lint**:
  ```bash
  cd web
  npm run typecheck
  npm run lint
  ```

---

## 🔑 Catatan Environment Variable Penting

> **Tidak ada nilai lingkungan yang di-hardcode di kode.** Semua konfigurasi (secret, URL, port, path binary, batas, kredensial seed) berasal dari `.env`; variabel yang kosong menghentikan fitur terkait dengan pesan yang menyebut namanya. Daftar lengkap ada di [`docs/operations.md`](docs/operations.md) dan `web/.env.example` / `ai-service/.env.example`. Isi `SEED_*` di `web/.env` sebelum `npm run seed`.

| Variabel | Keterangan |
|---|---|
| `INTERNAL_API_SECRET` | Secret token handshake antara Next.js dan FastAPI. **Harus bernilai sama** di `web/.env` dan `ai-service/.env`. |
| `FASTAPI_SERVICE_URL` | URL internal AI Service. Gunakan loopback `http://127.0.0.1:8000` (server-ke-server, bukan IP jaringan). |
| `JWT_SECRET` | Penandatangan sesi login. **Wajib diisi** (tanpa nilai bawaan; aplikasi menolak login bila kosong) dengan nilai acak yang panjang, mis. `openssl rand -base64 48`. |
| `ENCRYPTION_SECRET_KEY` | Kunci enkripsi API key model. **Wajib diisi.** |
| `NEXT_PUBLIC_MAX_VIDEO_SECONDS` | Batas durasi video dalam detik (mis. `120` = 2 menit). Ubah lalu `npm run build` dan restart. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Path ffmpeg dan ffprobe (butuh libx264 dan libwebp). |
| `SUPABASE_SERVICE_ROLE_KEY` | Hanya server: upload/hapus media di Supabase Storage (bucket `img`, `vids`). **Rahasia.** |
| `SAM3_CHECKPOINT`, `FFMPEG_PATH` | (ai-service) Bobot SAM 3.1 dan ffmpeg dengan libx264, untuk provider `sam3`. |
| `DATABASE_URL` & `DIRECT_URL` | Connection string PostgreSQL (Supabase / local DB). |
| `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Kredensial Supabase Storage & Auth. |
