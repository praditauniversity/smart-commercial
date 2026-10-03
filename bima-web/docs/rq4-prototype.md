# Purwarupa RQ4: penilaian risiko, deteksi YOLO, galeri frame, koreksi petugas

Dokumen ini merangkum fitur purwarupa tesis (Fase 4) yang dibangun di atas platform BIMA, cara menjalankannya, dan batasannya.
Prinsip: angka "hasil nyata" hanya berasal dari data riil (evaluasi RQ3 yang sudah ada); data simulasi selalu diberi label
**data contoh**; jawaban Validasi Ahli tidak pernah dibuat atau diisi oleh sistem.

## 1. Pemetaan terhadap kebutuhan

| Kebutuhan | Implementasi |
|---|---|
| Skor Risiko = Severity × Exposure, nilai {1,2,3,4,6,9}, pita Rendah/Sedang/Tinggi/Kritikal | `web/src/lib/risk.ts` (+ tes). Severity dibaca dari data master kelas; Exposure dari zona sesi |
| Dua kelompok: Keselamatan Infrastruktur vs Monitoring Kepatuhan | `ClassDefinition.categoryGroup`; Monitoring Kepatuhan **tidak pernah** diberi skor (hanya status terdeteksi) |
| Deteksi dari weight yang sudah ditraining | `ai-service`: provider `yolo` (6 model, CPU), endpoint `POST /api/v1/yolo/detect` |
| Video + bounding box, Opsi A (galeri frame) | Frame sampel dari **berkas asli** saat unggah; `FrameGallery`; video 720p hanya untuk diputar |
| Pencocokan 35 klip RQ3 | `web/src/lib/clip-match.ts`: nama berkas **dan** durasi; badge "Data uji — dievaluasi" / "Video baru — belum dievaluasi" |
| Jalur koreksi petugas | `OfficerCorrection` + `POST /api/detections/[id]/correct` dan `POST /api/sessions/[id]/missed` |
| 3 peran + dasbor masing-masing | admin, surveyor, supervisor: `web/src/lib/access.ts`, proxy, guard API |
| Instrumentasi latensi per modul | `MediaAsset.processingMetrics`, panel di dasbor admin |
| Instrumen Validasi Ahli | `/admin/validasi-ahli` (lembar kosong, DRAF, sesuaikan dengan Tabel 3.30) |

## 2. Peran dan hak akses

| Peran | Akses |
|---|---|
| `admin` | Semua data master (kelas, Severity, zona, model, pengguna), semua temuan semua surveyor, hasil koreksi supervisor, latensi |
| `surveyor` | Hanya mengentri dan melihat sesi/temuan miliknya sendiri |
| `supervisor` (Supervisor/Manajer, satu peran) | Melihat seluruh sesi semua surveyor dan mengoreksinya lewat jalur koreksi. **Tidak** dapat mengubah/menghapus data surveyor (403 pada 13 endpoint tulis) |

Pembatasan data dasbor dilakukan di server (`/api/dashboard/overview`), bukan di klien. Uji: `npm run test:rbac` (60 pengecekan).

## 3a. Cara tercepat: satu perintah (demo lokal)

Prasyarat: Node.js 20+, Python 3.10+, ffmpeg (dengan libx264 dan libwebp), 6 berkas weight di `ai-service/models/yolo11n_seed0/`,
serta PostgreSQL kosong (atau Docker).

```bash
# dari folder bima-web/
node scripts/local-demo.mjs --database-url "postgresql://user:sandi@localhost:5432/bima_demo"
# atau, bila Docker berjalan, biarkan skrip membuat PostgreSQL sendiri:
node scripts/local-demo.mjs --docker-db
# sekaligus membuat sesi demo dari sebuah video (nama berkas asli klip uji dikenali sebagai "dievaluasi"):
node scripts/local-demo.mjs --docker-db --video "C:\\klip\\20260920_080304-002-00.01.17.012-00.02.17.012-seg2.mp4"
```

Skrip memeriksa prasyarat (dan menjelaskan yang kurang), membuat venv Python + memasang dependensi (sekali, unduhan besar), memigrasi dan
men-seed database, lalu menjalankan ai-service dan web, dan mencetak alamat serta kata sandi tiga akun (admin, supervisor, surveyor).
Kata sandi dibuat acak dan disimpan di `.demo/kredensial.txt`. File `.env` Anda **tidak disentuh**; konfigurasi demo ada di `.demo/`
(di-gitignore). Gunakan database kosong khusus demo. Perintah lain: `setup`, `start`, `demo`, `help`; `--reset` membuat ulang konfigurasi.

## 3. Cara menjalankan manual (pengembangan)

1. Database: `DATABASE_URL`/`DIRECT_URL` → `npx prisma migrate deploy` → `npm run seed` (membuat admin, surveyor, supervisor dari env `SEED_*`) → `npm run seed:risk` (8 kelas YOLO, 3 zona contoh, 35 klip RQ3, model YOLO).
2. Weight (di luar git): letakkan `<kategori>-best.pt` di `ai-service/models/yolo11n_seed0/` (pavedroad, vegetation, weeds, sign, banner, house_notice).
3. ai-service: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`, `pip install -r requirements.txt -r requirements-yolo.txt`, isi `YOLO_*` di `.env`, `python main.py`.
4. web: isi `.env` (lihat `.env.example`; `FRAME_*`, `YOLO_REQUEST_TIMEOUT_MS`; tanpa Supabase gunakan `STORAGE_BACKEND=local` + `LOCAL_STORAGE_DIR`), `npm run dev`. Akses dev lewat `localhost`, atau isi `ALLOWED_DEV_ORIGINS`.
4a. Opsional, hanya demo lokal: `DEMO_LOGIN_ENABLED=true` di `web/.env` menampilkan tombol "Akses Cepat" di halaman login yang mengisi email dan kata sandi dari `SEED_*`. Restart server setelah mengubah `.env`. Tidak aktif pada mode production.
5. Di menu Model AI, jadikan model `YOLO11n seed0` sebagai default (seed menjadikannya default hanya bila belum ada default lain).

## 4. Pengujian

| Perintah | Isi |
|---|---|
| `npm test` (web) | Tes unit murni: risiko, akses, koreksi, pencocokan klip, perencana frame, ringkasan dasbor, latensi, validasi master |
| `npm run test:rbac` | Hak akses 3 peran, koreksi, cakupan dasbor, data master (server berjalan) |
| `npm run test:video` | Alur video penuh dengan berkas nyata (`VIDEO_PATH`): unggah, 24 frame, pencocokan klip, deteksi, skor, hapus |
| `pytest` (ai-service) | Perencana frame, pemetaan kelas, mesin YOLO. Tes berbobot otomatis dilewati bila `YOLO_WEIGHTS_DIR` tidak diset; `YOLO_SAMPLE_DIR` mengaktifkan tes pada citra contoh |

## 5. Keputusan desain yang perlu diketahui

- **Sampling frame**: ~0,5 fps, maksimal 24 frame, **disebar merata** di seluruh durasi (bukan 24 frame pertama). Klip 60 dtk menghasilkan 24 frame (jarak ±2,5 dtk).
- **Pencocokan klip**: nama berkas saja tidak cukup. Nama sama tetapi durasi berbeda > 3 dtk **tidak** dianggap terevaluasi, dan alasannya dicatat di `clipMatchNote`, agar narasi/skor klip lain tidak menempel pada video yang berbeda.
- **Sesi tanpa zona**: temuan Keselamatan Infrastruktur tidak diberi skor (Exposure tidak diketahui); tidak ditebak.
- **Rambu, dua tahap** (opsi B): Tahap 1 mendeteksi semua rambu; setiap rambu dipotong dengan `adaptive_crop_box` (disalin apa adanya dari notebook; kotak rambu lain dari Tahap 1 menjadi `other_boxes`) lalu diklasifikasi `normal`/`damaged` pada imgsz 224 oleh **classifier fold0, hasil 5-fold cross-validation** (`fold0_best.pt`, yolo11n-cls). Aturan:
  - `normal` → **tidak diberi skor risiko** (tampil sebagai temuan normal).
  - `damaged` → Severity sementara 2, berlabel "subtipe belum ditentukan". Classifier **tidak** menentukan subtipe.
  - Hanya untuk rambu rusak, **supervisor** dapat memilih satu dari 6 tag subtipe (data master di Admin → Data Master Risiko; kode, label, severity, dan status aktif dapat ditambah/diubah): panel_hilang/penyok/merosot = 3, panel_miring/tiang_miring = 2, pudar = 1. Kelas selain rambu tidak memiliki opsi ini.
  - Prioritas severity: koreksi manual petugas > severity tag > nilai sementara kelas. Severity tag disalin ke temuan saat dipilih, sehingga perubahan master hanya berlaku untuk pemilihan berikutnya.
  - Probabilitas classifier sengaja **tidak ditampilkan** (val/loss tinggi → kemungkinan terlalu percaya diri); akurasi top-1 0,8922 adalah validasi lipatan-0, bukan uji independen.
  - Aktivasi: salin `fold0_best.pt` menjadi `ai-service/models/yolo11n_seed0/sign_stage2_fold0_best.pt`, set `SIGN_CONDITION_WEIGHTS=sign_stage2_fold0_best.pt` di `ai-service/.env` (otomatis oleh `npm run demo` bila berkas ada), jalankan `npx prisma migrate deploy` dan `npm run seed:risk`, lalu restart ai-service dan web. Deteksi rambu yang diproses sebelum Tahap 2 aktif perlu diproses ulang.
- **Persetujuan survei**: dilakukan oleh **supervisor** (admin tetap dapat). Pengiriman sesi oleh surveyor menampilkan "menunggu disetujui/direview oleh supervisor".
- **Perubahan Severity kelas / Exposure zona** berlaku untuk deteksi berikutnya; temuan lama tidak dihitung ulang otomatis. Mengganti kelas temuan (oleh petugas) menghitung ulang skornya.
- **Hitungan di dasbor** adalah jumlah kotak deteksi pada frame sampel, **bukan objek unik** (belum ada penggabungan antar-frame). Skor lokasi memakai deteksi terburuk.
- **Temuan "keliru"** tidak dihapus; ditandai dan dikeluarkan dari hitungan valid dan skor lokasi. **"Terlewat"** adalah pernyataan petugas dan tidak membuat `Detection`.
- Hasil YOLO tidak memakai kelayakan (`layak/tidak_layak`); nilainya `tidak_dinilai`.

## 6. Batasan yang diketahui

- Uji dilakukan dengan PostgreSQL lokal dan `STORAGE_BACKEND=local`. **Jalur penyimpanan Supabase untuk frame dan Docker belum diuji** (kode memakai pola yang sama dengan unggahan yang sudah ada).
- Waktu terbesar saat unggah video adalah kompresi 720p yang sudah ada (preset `slow`), bukan AI. Pada klip 4K 60 dtk ±130 dtk di mesin uji.
- Ambang confidence awal `YOLO_CONF=0.25` adalah pilihan awal (bawaan Ultralytics), bukan hasil penyetelan; dasbor dapat menyaring tampilan tanpa memproses ulang.
- Vegetasi dan rambu memiliki kinerja deteksi terendah (lihat BAB IV); hasilnya perlu ditinjau petugas.
- Masalah keamanan lama di `prd-gap-analysis.md` tidak dikerjakan di sini.
