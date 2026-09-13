# Smart Commercial — AI Vision Pemantauan Kawasan

Repositori ini memuat dua bagian proyek yang saling melengkapi:

- **Platform web** untuk pengelolaan survei, media, hasil deteksi, pengguna, model AI, dan proses peninjauan.
- **Riset computer vision** untuk segmentasi kondisi jalan menggunakan pendekatan VLM dan eksperimen FastSAM.

## Struktur proyek

```text
smart-commercial/
├── bima-web/
│   ├── web/                 # Next.js, React, Tailwind, Prisma, dan Supabase
│   ├── ai-service/          # FastAPI untuk inferensi dan pemrosesan media
│   └── docs/                # PRD serta hasil code review
└── publicspace_vlm/
    ├── datasets/            # Dataset YOLO (train, valid, test)
    ├── runs/                # Artefak pelatihan dan prediksi
    └── pothole_sam_segmentation_fixed.ipynb
```

## Fitur utama

- Upload dan pemrosesan gambar atau video survei.
- Deteksi objek melalui provider Vision AI (OpenRouter atau on-premise).
- Pembagian video menjadi segmen, deduplikasi temporal, dan deteksi konflik kelas.
- Pengelolaan kelas deteksi, konfigurasi model, pengguna, serta alur review oleh admin.
- Dashboard, peta, sesi survei, dan mode pemantauan frame langsung.
- Eksperimen segmentasi kerusakan jalan dengan kelas `bache`, `grieta`, `registro`, dan `rejilla`.

## Prasyarat

- Node.js dan npm
- Python 3.10 atau lebih baru
- PostgreSQL/Supabase untuk aplikasi web

## Menjalankan aplikasi

Jalankan service AI dan aplikasi web pada terminal terpisah.

### 1. AI service

```powershell
cd bima-web/ai-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Buat file `bima-web/ai-service/.env` dan isi minimal:

```env
INTERNAL_API_SECRET=ganti-dengan-secret-acak-yang-kuat
AI_SERVICE_ALLOWED_ORIGINS=http://localhost:3000
```

Kemudian jalankan:

```powershell
uvicorn main:app --reload --port 8000
```

Service tersedia di `http://127.0.0.1:8000`; endpoint kesehatan berada di `/health` dan dokumentasi Swagger di `/docs`.

### 2. Aplikasi web

```powershell
cd bima-web/web
npm install
npx prisma generate
npm run dev
```

Buat `bima-web/web/.env` sesuai koneksi database dan layanan yang dipakai. Variabel berikut diperlukan oleh konfigurasi aplikasi:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
FASTAPI_SERVICE_URL=http://127.0.0.1:8000
INTERNAL_API_SECRET=ganti-dengan-secret-yang-sama-dengan-ai-service
```

Aplikasi web kemudian tersedia di `http://localhost:3000`.

> `INTERNAL_API_SECRET` pada web dan AI service harus sama. Jangan menyimpan file `.env`, API key, atau kredensial database ke Git.

## Perintah pengembangan

```powershell
# Dari bima-web/web
npm run dev
npm run build
npm run lint
npm run typecheck
npm run seed

# Dari bima-web/ai-service
pytest
```

## Dataset dan eksperimen vision

Folder `publicspace_vlm/datasets` memuat dataset yang dibagi ke `train`, `valid`, dan `test`, dengan label segmentasi untuk empat kelas di atas. Notebook `pothole_sam_segmentation_fixed.ipynb` dipakai untuk eksperimen segmentasi, sementara `runs/` berisi artefak eksperimen sebelumnya.

Saat ini proyek tidak menggunakan YOLO. Dependensi eksperimen seperti `torch`, `torchvision`, FastSAM, OpenCV, dan NumPy diinstal terpisah apabila diperlukan untuk menjalankan notebook atau eksperimen lokal.

## Dokumentasi lanjutan

- [PRD aplikasi web](bima-web/PRD_%20Aplikasi%20Web%20AI%20Pemantauan%20Kawasan.md)
- [Dokumentasi code review](bima-web/docs/code-review/README.md)
- [README platform web](bima-web/README.md)
