# AI Vision Pemantauan Kawasan (Research & Web Platform)

Aplikasi Web Pemantauan Kawasan Terintegrasi AI Vision untuk deteksi objek, analisis temporal, verifikasi grid, dan pemantauan kawasan/wilayah berbasis video & gambar.

---

## 🏗️ Struktur Project

```
├── web/           # Next.js 16 (App Router) + React 19 + Tailwind + Prisma + Supabase
├── ai-service/    # Python 3.10+ FastAPI (Inference, Video Splitter, Grid Overlay, Deduplication)
└── docs/          # Dokumentasi & PRD
```

---

## 🚀 Panduan Setup untuk Tim / Kolaborator Baru

### 1. Clone Repository
```bash
git clone <URL_REPO_GITHUB>
cd bima-research
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
uvicorn main:app --reload --port 8000
```
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

# 5. (Opsional) Sinkronkan skema database jika menggunakan DB lokal/baru
# npx prisma db push
# npm run seed

# 6. Jalankan server Next.js development
npm run dev
```
> Web application akan berjalan di `http://localhost:3000`.

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

| Variabel | Keterangan |
|---|---|
| `INTERNAL_API_SECRET` | Secret token handshake antara Next.js dan FastAPI. **Harus bernilai sama** di `web/.env` dan `ai-service/.env`. |
| `FASTAPI_SERVICE_URL` | URL internal AI Service, default: `http://127.0.0.1:8000`. |
| `DATABASE_URL` & `DIRECT_URL` | Connection string PostgreSQL (Supabase / local DB). |
| `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Kredensial Supabase Storage & Auth. |
