# PRD: Aplikasi Web AI Pemantauan Kawasan (BIMA Vision)

| | |
|---|---|
| **Versi dokumen** | 2.1 (disinkronkan dengan kode + keputusan produk 2026-09-21) |
| **Tanggal** | 2026-09-21 |
| **Basis** | Kode di branch `main` (termasuk perubahan working tree yang belum di-commit: provider SAM3, `media-storage`, `AuditTimeline`) |
| **Pengganti** | PRD v1.0 (lihat riwayat git: commit `fe14d40`) |

Dokumen ini adalah PRD v1.0 yang dicocokkan dengan implementasi `web/` dan `ai-service/` saat ini. Aturan bisnis dan user story dari v1.0 dipertahankan. Yang berubah adalah **penandaan status implementasi** di setiap kebutuhan, ditambah bagian baru untuk hal yang sudah dibangun tetapi belum ada di PRD (terutama provider SAM3 lokal).

Dokumen pendamping (semua di [`docs/`](docs/README.md)):

- [`docs/prd-gap-analysis.md`](docs/prd-gap-analysis.md): daftar selisih PRD vs kode beserta backlog prioritas.
- [`docs/architecture.md`](docs/architecture.md), [`docs/data-model.md`](docs/data-model.md), [`docs/api-reference.md`](docs/api-reference.md), [`docs/ai-service.md`](docs/ai-service.md), [`docs/operations.md`](docs/operations.md).

**Legenda status** yang dipakai di seluruh dokumen:

| Simbol | Arti |
|---|---|
| ✅ | Sesuai PRD dan sudah terimplementasi |
| 🟡 | Terimplementasi sebagian (catatan menjelaskan bagian yang kurang) |
| 🔄 | Terimplementasi, tetapi dengan cara yang berbeda dari PRD v1.0 |
| ❌ | Belum terimplementasi |
| ➕ | Fitur baru yang sudah ada di kode tetapi tidak ada di PRD v1.0 |

## Keputusan Produk (2026-09-21)

Diputuskan oleh tim dan sudah tercermin di seluruh dokumen ini:

| # | Keputusan | Dampak |
|---|---|---|
| K1 | **Autentikasi memakai JWT + bcrypt buatan sendiri**, bukan Supabase Auth. Supabase hanya untuk PostgreSQL dan Storage | US-010, FR-58, FR-68 menjadi ✅ (bukan lagi penyimpangan) |
| K2 | **Video dibatasi maksimal 2 menit** (dapat diubah lewat `NEXT_PUBLIC_MAX_VIDEO_SECONDS`, mis. `60` untuk 1 menit) | FR-87/88 sebagian terpenuhi. Divalidasi di server (ffprobe) dan di browser |
| K3 | **Konflik kelas harus bekerja juga pada hasil SAM3** | Diimplementasikan (FR-25) |
| K4 | **Hasil per kelas memakai pagination** | Diimplementasikan (US-002, US-007) |
| K5 | **Halaman `/admin/*` dan `/surveyor/*` dijaga proxy (middleware)** | Diimplementasikan (FR-A11) |
| K6 | **`JWT_SECRET` hanya dari environment**, tanpa nilai bawaan di kode | Diimplementasikan (FR-A9) |
| K7 | **File asli tidak disimpan**; hanya hasil kompresi yang disimpan | FR-86 terpenuhi menurut keputusan ini; Open Question terjawab |

## Ringkasan Perubahan dari PRD v1.0

1. ➕ **Provider AI ketiga: `sam3`** (SAM 3 / 3.1 lokal berbasis text prompt) berjalan di `ai-service` sebagai job asinkron dengan polling. Provider `OpenRouter` (VLM) dan `onpremise` tetap ada.
2. ✅ **Autentikasi bukan Supabase Auth (keputusan K1).** Sistem memakai tabel `User` sendiri, password bcrypt, dan sesi JWT di cookie `bima_session` (umur dari `SESSION_MAX_AGE_SECONDS`). Supabase dipakai untuk **PostgreSQL** dan **Storage** saja.
3. 🔄 **Upload media melewati server Next.js.** File dikompres dengan `ffmpeg` (gambar → WebP maks 1280px, video → H.264 maks 720p tanpa audio) lalu diunggah ke bucket Supabase `img` / `vids`. **File asli tidak disimpan (keputusan K7).** Video dibatasi 2 menit (K2).
4. 🔄 **FastAPI tidak menulis ke database.** Hasil deteksi dikembalikan ke Next.js, yang menyimpan `MediaSegment` dan `Detection` dalam satu transaksi.
5. 🟡 **Pemrosesan video pada jalur VLM masih placeholder**: durasi diasumsikan 15 detik dan bytes video dikirim sebagai satu gambar. Jalur SAM3 memproses video sungguhan, tetapi menghasilkan satu `MediaSegment` per video (bukan potongan 10 detik). Karena video dibatasi 2 menit, pemecahan segmen bukan lagi prioritas.
6. ➕ Kelayakan pada jalur SAM3 ditentukan **heuristik luas area** (bukan penilaian model), lalu dapat dikoreksi admin.
7. ➕ Ada `AuditLog` menyeluruh (aksi surveyor dan admin) dan komponen `AuditTimeline`.
8. ✅ Sejak v2.1: konflik kelas pada SAM3, pagination temuan, proteksi halaman (proxy), batas durasi video, dan `JWT_SECRET` wajib dari env sudah diimplementasikan.
9. 🟡 Masih belum ada: filter multi-kelas di dashboard, UI kelas saling eksklusif, preview/test deteksi kelas, limit ukuran file (byte), dan penyimpanan raw AI response.

## 1. Introduction/Overview

Aplikasi web berbasis AI untuk membantu survei kondisi infrastruktur di lapangan, seperti rambu jalan rusak, jalan berlubang, marka pudar, manhole, dan objek lain yang ditentukan admin. Surveyor membuat sesi survei (nama, lokasi, tanggal, waktu mulai), lalu mengupload banyak gambar atau video ke sesi tersebut. Setiap media diproses AI tanpa mengakhiri sesi, dan surveyor dapat terus menambah media selama sesi berlangsung.

Ada dua keluarga model AI, dipilih admin lewat **Model AI aktif (default)**:

- **VLM** (`OpenRouter` atau `onpremise`): model bahasa-visi menghasilkan kelas, bounding box, kondisi, dan kelayakan berdasarkan prompt yang dibangun dari definisi kelas. Default awal: Qwen3 VL 8B Instruct.
- **SAM3 lokal** (`sam3`) ➕: segmentasi berbasis text prompt (`samPrompt` per kelas) yang berjalan di GPU mesin server. Menghasilkan bounding box dan confidence. Kelayakan dihitung dari luas area relatif terhadap frame.

Semua provider dikonversi ke skema `Detection` internal yang sama. Setiap hasil punya bukti visual, lokasi, riwayat perubahan, dan jejak review.

## 2. Goals

| # | Goal | Status |
|---|---|---|
| G1 | Satu sesi survei berisi banyak gambar dan video | ✅ |
| G2 | Upload dan proses AI berlanjut tanpa mengakhiri atau mengirim survei | ✅ |
| G3 | Lifecycle media terpisah dari lifecycle sesi | ✅ |
| G4 | Proses AI asynchronous, upload tidak menunggu inferensi | 🟡 SAM3 berjalan sebagai job di background. Jalur VLM: route `process` menunggu respons worker (frontend tidak terblokir) |
| G5 | Hasil digabung per sesi dan dikelompokkan per kelas | ✅ Dengan pagination (12 kartu per halaman) |
| G6 | Satu objek = satu `Detection`, dapat ditelusuri ke media sumber dan versi processing | ✅ |
| G7 | Surveyor dapat mengedit metadata sesi dan menghapus media sebelum submit | ✅ |
| G8 | Submit diblokir jika ada media belum selesai atau konflik belum diselesaikan | ✅ |
| G9 | Deteksi konflik antar kelas saling eksklusif | ✅ Jalur VLM dan SAM3 (gambar dan video). Pengaturan kelas eksklusif masih lewat API |
| G10 | Akhiri sesi terpisah dari upload dan submit | ✅ |
| G11 | Approval admin sebelum data menjadi final | ✅ |
| G12 | Revisi lewat versi baru tanpa mengubah versi lama | ✅ (lihat catatan immutability di 3.6) |
| G13 | Admin mengelola kelas lewat konfigurasi dan prompt, tanpa retraining | ✅ |
| G14 | Admin mengelola model AI (OpenRouter, on-premise, SAM3) | ✅ |
| G15 | Detection menyimpan referensi versi kelas dan konfigurasi model | 🟡 Referensi ada, tetapi tidak menyimpan snapshot prompt penuh |
| G16 | Dashboard rekap hasil yang disetujui | ✅ |
| G17 | State machine eksplisit | ✅ |

## 3. Core Domain Rules

### 3.1 SurveySession

Container utama satu survei. Field (lihat [`docs/data-model.md`](docs/data-model.md)):

- `name`, `locationType` (`point` | `polygon`), `locationGeojson`, `locationAddress`.
- `surveyDate`, `startedAt`, `finishedAt`, `status`.
- Pemilik (`surveyorId`), `mediaAssets[]`, `submissions[]`, `detections[]`.

### 3.2 MediaAsset

Satu file media yang diupload. Field penting: `fileType` (`image` | `video`), `fileUrl` (URL publik bucket), `storagePath`, `durationSeconds`, `status`, `errorMessage`, `idempotencyKey` (unik).

Status yang terdefinisi: `queued`, `uploading`, `uploaded`, `processing`, `completed`, `failed`, `deleted`.

Catatan implementasi:

- Alur upload langsung menetapkan `uploaded`. Status `queued` dan `uploading` ada di state machine tetapi **tidak dipakai** oleh alur saat ini (upload dilakukan satu request ke server, bukan resumable).
- Penghapusan media adalah **hard delete** (baris `MediaAsset`, `MediaSegment`, `Detection`, dan file di bucket dihapus). Status `deleted` disediakan tetapi tidak ditulis oleh route hapus.
- Kegagalan satu media tidak mengubah status sesi ✅.
- **Batas durasi video** (K2): maksimal 120 detik. Server mengukur durasi asli dengan `ffprobe` sebelum kompresi dan menolak dengan HTTP 400 bila lebih panjang atau tidak terbaca. Browser memeriksa lebih dulu agar file besar tidak diunggah sia-sia. Batas diatur `NEXT_PUBLIC_MAX_VIDEO_SECONDS` (butuh build ulang).

### 3.3 MediaSegment

Unit hasil pemrosesan per media.

- Gambar: satu segmen ✅.
- Video jalur **SAM3**: satu segmen yang mencakup seluruh durasi (`startTime=0`, `endTime=durasi`). `mediaUrl` menunjuk ke **video hasil anotasi** (overlay) dan `extractionMetadata` memuat ringkasan (fps, puncak per kelas, prompt, dsb.) ➕.
- Video jalur **VLM**: `plan_video_segments` merencanakan segmen ≤10 detik, tetapi durasi diasumsikan 15 detik dan tidak ada ekstraksi frame nyata 🟡. Lihat 12.2.

Aturan PRD "video > 10 detik dibagi menjadi segmen ≤10 detik" ❌ belum terpenuhi secara nyata. Durasi video dibatasi maksimal **2 menit** (K2), sehingga satu segmen SAM3 paling banyak mencakup 2 menit.

### 3.4 Detection

Satu objek hasil deteksi. Menyimpan `classId`, `classVersionId`, `className` (snapshot nama), `bbox` (JSON, normalized 0–1), `condition`, `feasibility` (`layak` | `cukup_layak` | `tidak_layak`), `timestampSeconds`, `frameIndex`, `locationGeojson` (default = lokasi sesi), `modelConfigId`, `modelName`, `promptVersion`, `hasConflict`, `conflictResolved`, `conflictDetails`, `isDeleted`. Format bbox internal:

```json
{ "x": 0.12, "y": 0.34, "width": 0.25, "height": 0.18 }
```

`promptVersion` berisi string tetap (`v1.0` untuk VLM, `sam3` untuk SAM3), bukan snapshot prompt.

### 3.5 Raw AI Response

PRD: boleh disimpan untuk audit. Implementasi: ❌ **tidak disimpan di database**. Debug lokal ada di `ai-service/openrouter_debug.log` (file log, di-gitignore, hanya untuk pengembangan). Data aplikasi bersumber dari `Detection` yang sudah dinormalisasi ✅.

### 3.6 Submission dan SubmissionVersion

Setiap submit/re-submit membuat `SubmissionVersion` dengan `versionNumber` bertambah dan `snapshotData` (JSON: metadata sesi, media, detection, ringkasan). Status versi: `menunggu_review` | `disetujui` | `ditolak`. Menyimpan `rejectReason`, `reviewNotes`, `reviewerId`, `submittedAt`, `reviewedAt`.

**Catatan penting immutability** 🟡: `snapshotData` tidak pernah diubah setelah dibuat. Namun koreksi admin (`admin-edit`) dan dashboard bekerja pada baris `Detection` yang hidup, bukan pada snapshot. Artinya angka dashboard mencerminkan koreksi admin, sedangkan snapshot menyimpan kondisi saat submit. Ini perlu diputuskan secara eksplisit (lihat Open Questions).

### 3.7 Versioning Kelas dan Model

- `ClassDefinitionVersion` menyimpan snapshot JSON kelas setiap kali kelas dibuat atau diubah ✅ (termasuk `samPrompt` dan `samColor`).
- `Detection` mengacu ke `classVersionId` (versi terbaru saat processing) dan `modelConfigId` ✅. `modelConfigId` dan `classVersionId` bernilai `SetNull` bila rujukan dihapus.
- Model yang sudah punya deteksi historis tidak di-hard-delete, hanya dinonaktifkan ✅.

## 4. Survey Session State Machine

Status: `berlangsung`, `selesai_menunggu_submit`, `menunggu_review`, `disetujui`, `ditolak`, `perlu_perbaikan`. Sumber kebenaran: [`web/src/lib/state-machine.ts`](web/src/lib/state-machine.ts).

```
berlangsung ──Akhiri Survei──▶ selesai_menunggu_submit ──Submit──▶ menunggu_review
                                                                     │        │
                                                                Approve      Reject
                                                                     ▼        ▼
                                                                disetujui   ditolak
                                                                              │ Buat Revisi
                                                                              ▼
                                            menunggu_review ◀──Re-submit── perlu_perbaikan
```

Guard (✅ sesuai PRD):

- **Submit / Re-submit** ditolak jika ada media `queued`/`uploading`/`processing`, ada media `failed`, atau ada `Detection` dengan `hasConflict && !conflictResolved`.
- **Approve/Reject** hanya admin. **Reject** wajib `rejectReason` tidak kosong.

Perbedaan kecil dari PRD (🔄):

| Aksi | PRD v1.0 | Implementasi |
|---|---|---|
| Upload media | hanya `berlangsung` | `berlangsung` **dan** `perlu_perbaikan` |
| Edit metadata sesi | `berlangsung`, `selesai_menunggu_submit` | ditambah `perlu_perbaikan` |
| Hapus media, retry processing | `berlangsung`, `selesai_menunggu_submit` | ditambah `perlu_perbaikan` |
| Hapus sesi | selama belum pernah disubmit | sama (route menolak sesi yang sudah punya submission) |
| Pembuat sesi | surveyor | surveyor **atau admin** |

Surveyor tidak dapat mengubah data pada `menunggu_review` dan `disetujui` ✅. `ditolak` → surveyor harus menekan `Buat Revisi` ✅.

## 5. Media Processing State Machine

Tabel transisi yang diizinkan (`validateMediaAssetTransition`):

| Dari | Ke |
|---|---|
| `queued` | `uploading`, `failed`, `deleted` |
| `uploading` | `uploaded`, `failed`, `deleted` |
| `uploaded` | `processing`, `failed`, `deleted` |
| `processing` | `completed`, `failed`, `deleted` |
| `completed` | `processing` (re-process), `deleted` |
| `failed` | `processing`, `queued`, `deleted` |

Retry menghapus `Detection` dan `MediaSegment` lama milik media itu lalu menulis ulang dalam satu transaksi, sehingga **tidak menghasilkan Detection duplikat** ✅. `idempotencyKey` dibuat acak per upload dan bersifat unik, tetapi tidak dipakai untuk menolak request ganda 🟡.

## 6. Deduplication dan Conflict Rules

### 6.1 Deduplication

- **Jalur VLM, video**: `deduplicate_temporal_detections` (IoU 0.45, jendela waktu 3 detik) 🟡 (bergantung pada ekstraksi frame yang masih placeholder).
- **Jalur SAM3, video**: tidak ada dedup antar frame. Sistem hanya menyimpan instance pada **frame puncak** tiap kelas (`_peaks`) dan membatasi 100 deteksi per kelas.
- Lintas gambar: tidak ada dedup otomatis ✅ (sesuai PRD).

### 6.2 Conflict Antar Kelas

Konflik = dua Detection di media/frame yang sama, kelas berbeda, IoU ≥ threshold, dan kedua kelas saling eksklusif (`conflict_detector.py`: `detect_class_conflicts` untuk gambar dan VLM, `detect_video_conflicts` untuk video SAM3).

- Default threshold 0.5, dapat diatur per kelas (`conflictIouThreshold`) lewat API ✅.
- 🟡 **UI admin belum memiliki kontrol** untuk `mutuallyExclusiveWith` maupun `conflictIouThreshold`. Nilainya hanya dapat diisi lewat API/database.
- ✅ **Jalur SAM3 mendeteksi konflik** (K3). Web mengirim `mutually_exclusive_with` dan `conflict_iou_threshold` tiap kelas, lalu menyimpan `hasConflict` dan `conflictDetails`. Gambar: dua temuan pada gambar yang sama. Video: temuan berasal dari frame puncak tiap kelas sehingga konflik dievaluasi **per frame** dari seluruh rekaman instance (hanya instance dengan confidence ≥ `SAM3_FINDING_CONF`); temuan kelas yang paling cocok (IoU tertinggi, lalu frame terdekat) ditandai konflik dan `conflictDetails` memuat `conflict_frame_index` dan `conflict_timestamp_seconds`.
- Kedua detektor kini mensyaratkan **frame yang sama** (`frame_index` sama) sesuai aturan PRD, dan mempertahankan konflik dengan IoU terkuat bila sebuah temuan berkonflik dengan lebih dari satu temuan lain.
- Surveyor menyelesaikan konflik lewat `resolve-conflict` sebelum submit ✅. Admin dapat mengoreksi kelas saat review ✅.

## 7. AI Output Contract

Semua provider mengembalikan `DetectionSchema` ✅ (`ai-service/schemas.py`):

```json
{
  "detections": [
    {
      "class_id": "uuid",
      "class_name": "jalan_berlubang",
      "bbox": { "x": 0.12, "y": 0.34, "width": 0.25, "height": 0.18 },
      "condition": "aspal rusak dengan lubang terlihat",
      "feasibility": "tidak_layak",
      "confidence": 0.9,
      "timestamp_seconds": null,
      "frame_index": null,
      "has_conflict": false,
      "conflict_details": null
    }
  ]
}
```

Aturan: hanya kelas dari active class list (dijaga lewat prompt 🟡), array kosong jika tidak ada objek, dan lapisan provider yang bertanggung jawab atas konversi ✅.

Provider yang tersedia:

| Provider | Nilai `provider` | Perilaku | Status |
|---|---|---|---|
| OpenRouter | `OpenRouter` | VLM via API OpenRouter, butuh API key | ✅ |
| On-premise | `onpremise` | VLM di endpoint sendiri (`endpoint_url`, key opsional) | ✅ |
| SAM3 lokal | `sam3` | Segmentasi text-prompt di GPU server; butuh `SAM3_CHECKPOINT`, torch, ultralytics | ➕ |
| Mock | `mock` | `MockVisionProvider` ada di kode tetapi tidak tersambung ke `get_provider` | dead code |

## 8. User Stories

Kriteria "Typecheck/lint passes" dan "Verify in browser" dipindahkan ke bagian *Definition of Done* di akhir dokumen dan berlaku untuk semua story. Centang `[x]` = terpenuhi di kode. `[~]` = sebagian. `[ ]` = belum.

### US-001: Membuat sesi survei

- [x] Surveyor mengisi nama survei.
- [x] Lokasi ditentukan di peta OpenStreetMap (Leaflet).
- [x] Lokasi berupa titik: pin manual, pencarian alamat (Nominatim `search`), atau GPS browser (dengan reverse geocode).
- [x] Lokasi dapat berupa area/polygon (`locationType = polygon`).
- [x] Tanggal survei diisi.
- [x] Waktu mulai tercatat otomatis (`startedAt`).
- [x] Status awal `berlangsung`.
- [x] Jika GPS ditolak, pin manual dan pencarian alamat tetap tersedia.
- [x] Transisi status divalidasi state machine.

### US-002: Upload gambar dan video dalam sesi

- [~] Upload banyak file. UI menerima `image/jpeg`, `image/png`, `video/mp4`. Server menerima semua `image/*` dan video (`mp4|mov|webm|mkv`). **Video maksimal 2 menit** (K2). Belum ada batas ukuran byte atau jumlah media.
- [x] Satu file = satu `MediaAsset`.
- [x] Gambar → satu `MediaSegment`.
- [ ] Video > 10 detik dibagi menjadi segmen ≤10 detik (lihat 3.3; durasi dibatasi 2 menit).
- [~] Upload dan AI asynchronous: SAM3 berjalan sebagai job background (route mengembalikan `202` lalu UI polling). Jalur VLM menunggu worker dalam satu request server.
- [x] Frontend tidak menunggu seluruh proses AI untuk melanjutkan.
- [x] Status media tampil per media (UI polling media yang `processing`).
- [x] Kegagalan media tidak mengubah status sesi.
- [x] Retry media gagal, tanpa Detection duplikat.
- [x] Hasil dikonversi ke skema `Detection`, lengkap dengan kelas, bbox, kondisi, kelayakan, referensi media, metadata model.
- [x] Hasil digabung akumulatif per sesi dan dikelompokkan per kelas.
- [~] Dedup objek yang sama antar frame berdekatan (hanya jalur VLM; SAM3 memakai frame puncak).
- [x] Tidak ada submission terpisah per batch.
- [x] Hasil per kelas dengan **pagination** (K4): filter kelas berupa chip, kartu temuan 12 per halaman. Pagination dilakukan di browser atas data yang sudah dimuat; pagination sisi server belum diperlukan pada skala prototipe.
- [x] Media yang dihapus tidak lagi dihitung.

### US-003: Mengakhiri sesi

- [x] Tombol `Akhiri Survei` terpisah dari upload dan submit.
- [x] Hanya pada status `berlangsung`.
- [x] Mencatat waktu selesai dan status menjadi `selesai_menunggu_submit`.
- [x] Setelah diakhiri: upload media baru diblokir.
- [ ] Konfirmasi sebelum mengakhiri (tombol langsung memanggil API tanpa dialog konfirmasi).
- [~] Pemberitahuan jika masih ada media diproses: API mengembalikan `warnings` (jumlah media `queued/uploading/processing` dan `failed`), tetapi belum menghalangi atau meminta konfirmasi.
- [x] Submit ditolak selama media `uploading`/`processing`.
- [x] Media `failed` dapat diproses ulang atau dihapus sebelum submit.

### US-004: Edit dan hapus sebelum submit

- [x] Edit nama, lokasi, tanggal saat `berlangsung`, `selesai_menunggu_submit`, dan `perlu_perbaikan`.
- [x] Hapus `MediaAsset` beserta segmen, detection, dan file di bucket.
- [x] Jumlah temuan per kelas ikut diperbarui.
- [~] Hapus sesi selama belum pernah disubmit: didukung API (`DELETE /api/sessions/{id}`), **belum ada tombol di UI**.
- [x] Konfirmasi sebelum hapus media (dialog `confirm`). Penghapusan permanen.
- [x] Sesi `menunggu_review` dan `disetujui` tidak dapat diedit surveyor.
- [x] Surveyor dapat mengoreksi kelas/kondisi/kelayakan `Detection` (dan menghapus detection) selama sesi masih editable ➕. Bounding box tidak dapat diedit ✅ (sesuai Non-Goals).

### US-005: Submit untuk review

- [x] Ringkasan sesi berstatus `selesai_menunggu_submit`, dikelompokkan per kelas (jumlah, kondisi, kelayakan, lokasi).
- [x] Submit aktif hanya jika tidak ada konflik belum selesai, tidak ada media `uploading`/`processing`, dan tidak ada media `failed`.
- [x] Submit membuat `SubmissionVersion` (snapshot) dan status menjadi `menunggu_review`.
- [x] Riwayat sesi dan riwayat versi (tab History) beserta status, waktu submit, hasil review.

### US-006: Revisi dan re-submit

- [x] Reject → status `ditolak`. Surveyor melihat alasan dan catatan admin.
- [x] `Buat Revisi` → status `perlu_perbaikan`. Versi lama tetap utuh.
- [x] Surveyor dapat menghapus media, menambah media, retry, dan koreksi detection.
- [x] Re-submit membuat `SubmissionVersion` baru. Versi lama tetap terlihat oleh surveyor dan admin.
- [x] Hanya satu versi aktif dalam antrean (dijamin oleh state machine sesi).
- [~] "Revision draft" bukan entitas terpisah. Revisi bekerja pada baris `Detection`/`MediaAsset` yang sama, dan yang immutable hanyalah snapshot.

### US-007: Review dan approval

- [x] Daftar sesi `menunggu_review` (filter status), dengan penanda re-submit (`versionNumber > 1`).
- [x] Detail `SubmissionVersion` dengan media, bbox overlay, kondisi, kelayakan, lokasi.
- [x] Hasil per kelas dengan pagination (kartu temuan 12 per halaman).
- [x] Admin dapat melihat dan menyelesaikan konflik kelas (termasuk konflik dari hasil SAM3).
- [x] Hak edit admin terdefinisi: **kelas, kondisi, kelayakan, catatan**. Bounding box tidak dapat diedit.
- [x] Semua perubahan tercatat di `AuditLog` dan tampil di `AuditTimeline`.
- [x] Approve dan Reject. Reject wajib memilih alasan dari daftar tetap (6 opsi di UI: kualitas buram, deteksi salah kelas, lokasi tidak sesuai, media duplikat, tidak memenuhi kriteria kelayakan, lainnya) ditambah catatan bebas.
- [x] Setelah approve, data final dan masuk dashboard.

### US-008: Dashboard rekap

- [x] Hanya sesi berstatus `disetujui`.
- [x] Menampilkan jumlah sesi, total temuan, temuan kritis (`tidak_layak`), dan temuan baik (`layak`).
- [x] Jumlah temuan per kelas (`class-summary`) dan sebaran lokasi di peta (`map-points`).
- [x] Filter rentang tanggal dan satu kelas, serta filter kelayakan pada peta.
- [ ] Filter **beberapa kelas** sekaligus.
- Catatan 🔄: dashboard menghitung dari `Detection` hidup pada sesi `disetujui`, bukan dari `snapshotData` versi yang disetujui.

### US-009: Hasil per kelas

- [x] Pemilihan kelas, hitungan per kelayakan, lintas sesi yang disetujui.
- [x] Tampilan peta (titik/area). Fallback lokasi sesi bila detection tanpa koordinat sendiri (`Detection.locationGeojson` diisi lokasi sesi).
- [~] Tampilan list per kelas tersedia lewat endpoint `class-summary`. Pemilihan beberapa kelas belum ada di UI.

### US-010: Manajemen user

- [x] Tambah, edit, nonaktifkan user; role `surveyor` atau `admin`; reset password oleh admin.
- [x] User nonaktif tidak dapat login dan sesi cookie-nya ditolak di API (`isActive` dicek saat login dan pada tiap `getCurrentUser`, dengan cache selama `USER_CACHE_TTL_MS`). Proxy halaman hanya memeriksa tanda tangan dan masa berlaku JWT, jadi user yang baru dinonaktifkan masih melihat kerangka halaman sampai token kedaluwarsa, tetapi semua data ditolak API.
- [x] **Autentikasi custom (bcrypt + JWT), keputusan K1.** Password di-hash bcrypt (cost 10). Sesi berupa JWT HS256 (umur dari `SESSION_MAX_AGE_SECONDS`) di cookie `httpOnly` `bima_session`. `JWT_SECRET` wajib dari environment tanpa nilai bawaan (K6). Proxy Next.js memeriksa cookie pada halaman, dan `requireAuth()` memeriksa ulang user di database pada tiap API.
- Tidak ada hard delete user.

### US-011: Manajemen kelas

- [x] Buat, edit, nonaktifkan kelas. Kelas yang sudah dipakai data historis tidak di-hard-delete.
- [x] Nama, deskripsi visual, kriteria kondisi, kriteria kelayakan (`layak`, `cukup_layak`, `tidak_layak`).
- [x] Deskripsi kelas menjadi bagian dari prompt VLM. Tidak ada threshold confidence numerik untuk kelayakan pada jalur VLM.
- [x] Versioning otomatis (`ClassDefinitionVersion`) setiap perubahan.
- [x] ➕ `samPrompt` (frasa noun bahasa Inggris) dan `samColor` (#RRGGBB) untuk provider SAM3.
- [~] Kelas saling eksklusif dan `conflictIouThreshold`: didukung API dan basis data, **belum ada kontrol UI**.
- [ ] Preview/test deteksi kelas sebelum dipakai surveyor.

### US-012: Manajemen model AI

- [x] Model default awal Qwen3 VL 8B Instruct (`qwen/qwen3-vl-8b-instruct`).
- [x] Tambah konfigurasi; provider `OpenRouter`, `onpremise`, ➕ `sam3` (dengan `samMode`: `optimized` | `fast`).
- [x] API key dienkripsi AES-256-CBC. API tidak mengembalikan nilai penuh (hanya `apiKeyMasked`).
- [x] Satu model default aktif; tes koneksi; soft delete untuk model yang sudah punya data historis.
- [x] Enkripsi memakai `ENCRYPTION_SECRET_KEY` dari env tanpa nilai bawaan di kode; bila kosong, fitur yang membutuhkannya berhenti dengan galat yang menyebut nama variabelnya.

### Definition of Done (berlaku untuk semua story)

- `npm run typecheck` dan `npm run lint` (web) lulus. `pytest` (ai-service) lulus.
- Diverifikasi manual di browser pada mode production (`npm run build && npm start`).
- Perubahan skema lewat Prisma Migrate.

## 9. Functional Requirements (status per kebutuhan)

### Sesi dan lokasi

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-1 | Buat SurveySession (nama, lokasi, tanggal, waktu mulai, pemilik, status awal) | ✅ | Admin juga bisa membuat |
| FR-2 | Lokasi titik atau polygon | ✅ | |
| FR-3 | Pin manual, pencarian alamat, geolocation | ✅ | Nominatim (publik, tanpa API key) |
| FR-4 | Fallback manual jika GPS gagal | ✅ | |

### Media dan pemrosesan

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-5 | Satu sesi banyak MediaAsset | ✅ | |
| FR-6 | Satu MediaAsset = satu file | ✅ | |
| FR-7 | Gambar = satu segmen | ✅ | |
| FR-8 | Video >10 dtk dibagi segmen ≤10 dtk | ❌ | SAM3: satu segmen. VLM: hanya rencana, durasi diasumsikan 15 dtk. Durasi dibatasi 2 menit (K2) |
| FR-9 | Proses AI asynchronous | 🟡 | SAM3 job background. VLM menunggu worker dalam satu request |
| FR-10 | Lifecycle 7 status media | 🟡 | `queued`/`uploading`/`deleted` tidak dipakai alur saat ini |
| FR-11 | Gagal media tidak mengubah status sesi | ✅ | |
| FR-12 | Retry idempotent | 🟡 | Hapus-lalu-tulis-ulang dalam transaksi. `idempotencyKey` tidak dipakai untuk dedup request |
| FR-13 | Retry tidak menduplikasi Detection | ✅ | |
| FR-14 | Satu segmen banyak Detection | ✅ | |
| FR-15 | Satu Detection = satu objek unik setelah dedup | 🟡 | Dedup hanya jalur VLM video |
| FR-16 | Detection menyimpan kelas, bbox, kondisi, kelayakan, referensi, metadata | ✅ | |
| FR-17 | Bbox normalized 0–1 | ✅ | Divalidasi Pydantic (`ge=0, le=1`) |
| FR-18 | Boleh menyimpan raw AI response | ❌ | Tidak disimpan di DB |
| FR-19 | Raw response bukan sumber utama | ✅ | |
| FR-20 | Semua provider → DetectionSchema | ✅ | |
| FR-21 | Model hanya mengembalikan kelas aktif | 🟡 | Dijaga prompt. Kelas tak dikenal pada penyimpanan tidak difilter eksplisit di jalur VLM |
| FR-22 | Dedup Detection pada frame video berdekatan | 🟡 | Jalur VLM saja |
| FR-23 | Dedup memakai IoU, waktu, hubungan temporal | 🟡 | IoU 0.45, jendela 3 dtk |
| FR-24 | Tidak menghapus Detection lintas gambar hanya karena mirip | ✅ | |
| FR-25 | Deteksi konflik IoU + mutually exclusive | ✅ | VLM dan SAM3 (K3). Video SAM3: dievaluasi per frame |
| FR-26 | Threshold konflik default 0.5, dapat dikonfigurasi | 🟡 | Per kelas via API. Belum ada UI. Payload proses memakai 0.5 tetap |
| FR-27 | Konflik harus diselesaikan sebelum submit | ✅ | |

### Lifecycle sesi dan submission

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-28 | Aksi `Akhiri Survei` terpisah | ✅ | Tanpa dialog konfirmasi |
| FR-29 | Catat waktu selesai, status `selesai_menunggu_submit` | ✅ | |
| FR-30 | Blokir upload setelah diakhiri | ✅ | |
| FR-31 | Edit metadata dan hapus media saat `berlangsung`/`selesai_menunggu_submit` | ✅ | Plus `perlu_perbaikan` |
| FR-32 | Hapus media menghapus segmen dan detection | ✅ | |
| FR-33 | Rekap otomatis setelah media dihapus | ✅ | |
| FR-34 | Submit hanya dari `selesai_menunggu_submit` | ✅ | Re-submit dari `perlu_perbaikan` |
| FR-35 | Submit diblokir bila ada media `uploading`/`processing` | ✅ | Termasuk `queued` |
| FR-36 | Media `failed` harus dihapus/diproses ulang | ✅ | |
| FR-37 | Submit membuat SubmissionVersion immutable | ✅ | Snapshot JSON |
| FR-38 | Status menjadi `menunggu_review` | ✅ | |
| FR-39 | State machine eksplisit | ✅ | `lib/state-machine.ts` |
| FR-40–44 | Transisi yang diizinkan | ✅ | |
| FR-45 | Versi yang sudah direview immutable | 🟡 | Snapshot tetap. `Detection` hidup masih bisa dikoreksi admin |
| FR-46 | Revisi tidak mengubah versi sebelumnya | ✅ | |
| FR-47 | Riwayat semua versi | ✅ | |
| FR-48 | Satu versi aktif per sesi | ✅ | |

### Review dan dashboard

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-49 | Admin melihat detail sesi dan riwayat versi | ✅ | |
| FR-50 | Admin mengoreksi Detection sesuai hak edit | ✅ | Kelas, kondisi, kelayakan, catatan |
| FR-51 | Perubahan admin dicatat audit trail | ✅ | `AuditLog` |
| FR-52 | Reject dengan alasan dari daftar | 🟡 | Daftar tetap di UI. Server hanya memeriksa tidak kosong |
| FR-53 | Catatan bebas | ✅ | |
| FR-54 | Approve → data final | ✅ | |
| FR-55 | Dashboard hanya data disetujui | 🔄 | Berbasis status sesi `disetujui`, bukan snapshot |
| FR-56 | Filter tanggal dan kelas | 🟡 | Satu kelas |

### Pengguna, kelas, model

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-57 | Kelola user dan role | ✅ | |
| FR-58 | ~~Supabase Auth~~ → autentikasi JWT + bcrypt buatan sendiri | ✅ | Keputusan K1 menggantikan kebutuhan lama |
| FR-59 | Kelola kelas | ✅ | |
| FR-60 | Versioning/snapshot kelas | ✅ | |
| FR-61 | Konfigurasi kelas saling eksklusif | 🟡 | API saja |
| FR-62 | Kelola konfigurasi model | ✅ | |
| FR-63 | Kredensial terenkripsi | ✅ | AES-256-CBC; kunci dari `ENCRYPTION_SECRET_KEY`, tanpa fallback di kode |
| FR-64 | Secret tidak diekspos ke frontend | ✅ | Masked |
| FR-65 | ModelConfig historis tidak di-hard-delete | ✅ | Soft delete |
| FR-66 | Detection menyimpan ClassDefinitionVersion | ✅ | |
| FR-67 | Detection menyimpan ModelConfig dan info model | 🟡 | ID, nama model, `promptVersion` string tetap |

### Arsitektur dan penyimpanan

| ID | Kebutuhan | Status | Catatan |
|---|---|---|---|
| FR-68 | Supabase untuk database dan storage (autentikasi tidak, lihat K1) | ✅ | |
| FR-69 | Supabase Storage via S3-compatible API | 🔄 | Memakai `supabase-js` / REST, bucket publik `img` dan `vids` |
| FR-70 | Upload langsung ke Storage tanpa transit server | ❌ | File melewati Next.js (kompresi ffmpeg) |
| FR-71 | Processing job asynchronous | 🟡 | Lihat FR-9. Job SAM3 disimpan di memori proses (hilang saat restart) |
| FR-72 | Idempotency untuk processing job | 🟡 | Lihat FR-12 |
| FR-73 | Migrasi lewat Prisma Migrate | ✅ | 3 migrasi |
| FR-74 | Prisma schema = source of truth | ✅ | |
| FR-75 | Next.js menangani frontend, auth, workflow, CRUD, dashboard | ✅ | |
| FR-76 | FastAPI: video splitting, ekstraksi frame, inferensi | 🟡 | Inferensi ✅, SAM3 ✅. Ekstraksi frame VLM placeholder. Kompresi media dilakukan di Next.js |
| FR-77 | FastAPI tidak dapat diakses publik | ✅ | Bind `127.0.0.1` dan wajib header rahasia |
| FR-78 | Autentikasi service-to-service | ✅ | `X-Internal-Secret`, perbandingan constant-time, fail-closed di FastAPI |
| FR-79 | FastAPI boleh menulis Detection ke DB | 🔄 | Tidak; Next.js yang menyimpan hasil |
| FR-80 | Transisi divalidasi di backend | ✅ | |
| FR-81 | Abstraction layer provider AI | ✅ | `BaseVisionProvider` |
| FR-82 | OpenRouter dan on-premise satu interface | 🟡 | SAM3 memakai jalur job terpisah |
| FR-83 | Basemap OpenStreetMap | ✅ | |
| FR-84 | Pencarian alamat Nominatim | ✅ | |
| FR-85 | Frame temporary dapat dihapus setelah processing | 🟡 | Direktori kerja SAM3 dihapus otomatis. Frame VLM tidak disimpan |
| FR-86 | Simpan media untuk menampilkan hasil Detection | ✅ | Menurut K7: hanya hasil kompresi yang disimpan, file asli tidak. SAM3 video menyimpan hasil anotasi |
| FR-87 | Limit media lewat konfigurasi | 🟡 | Durasi video maks 2 menit lewat `NEXT_PUBLIC_MAX_VIDEO_SECONDS` (K2). Batas ukuran byte dan jumlah media belum ada |
| FR-88 | Validasi format dan limit sebelum diproses | 🟡 | Tipe dan durasi divalidasi (browser + server). Limit ukuran belum ada |

### Kebutuhan baru ➕ (belum ada di PRD v1.0)

| ID | Kebutuhan | Status |
|---|---|---|
| FR-A1 | Provider `sam3` dengan `samPrompt`/`samColor` per kelas dan `samMode` (`optimized` optical-flow, `fast` phase-correlation) per model | ✅ |
| FR-A2 | Job SAM3 berjalan di satu worker thread (GPU single-owner), progres dapat di-polling, hingga 200 job terakhir disimpan di memori | ✅ |
| FR-A3 | Hasil SAM3: hanya instance ber-confidence ≥ `SAM3_FINDING_CONF` (default 0,4) dijadikan temuan; maksimal 100 per kelas; instance di bawah ambang tetap ada di ringkasan agar UI dapat menampilkannya | ✅ |
| FR-A4 | Kelayakan SAM3 = heuristik luas area (≥1% → `tidak_layak`, ≥0,2% → `cukup_layak`, lainnya `layak`) yang dapat dikoreksi admin | ✅ |
| FR-A5 | Video hasil anotasi SAM3 diunggah ke bucket `vids` dan dipakai sebagai media segmen | ✅ |
| FR-A6 | Model SAM3 dibongkar dari GPU setelah idle (`SAM3_IDLE_UNLOAD_SECONDS`) | ✅ |
| FR-A7 | Kompresi media saat upload (gambar WebP ≤1280 px, video H.264 ≤720p tanpa audio) | ✅ |
| FR-A8 | `AuditLog` untuk aksi surveyor dan admin (upload, hapus, edit metadata, akhiri, submit, revisi, koreksi, resolve conflict, approve, reject, manajemen user/kelas/model) | ✅ |
| FR-A9 | Sesi login = JWT (umur dari `SESSION_MAX_AGE_SECONDS`) di cookie `httpOnly` `bima_session`; flag `Secure` aktif di production (wajib HTTPS). `JWT_SECRET` wajib dari env, tanpa fallback; aplikasi gagal dengan pesan jelas bila kosong | ✅ |
| FR-A10 | Seed data: `seed.ts` (admin, surveyor, kelas awal, model default) dan `seed-sam3.ts` (SAM prompt, model SAM3 sebagai default) | ✅ |
| FR-A11 | Halaman `/admin/*` dan `/surveyor/*` diamankan di level route: tanpa JWT valid → redirect ke `/login`; role `surveyor` di `/admin/*` → redirect ke `/surveyor/sessions` (`src/proxy.ts`, Next.js 16) | ✅ |
| FR-A15 | **Tidak ada nilai lingkungan yang di-hardcode di kode.** Secret, URL, host/port, path binary, batas, timeout, kredensial seed, dan endpoint layanan pihak ketiga hanya berasal dari environment. Variabel yang kosong menghentikan fitur terkait dengan galat yang menyebut nama variabelnya (`web/src/lib/env.ts`, `ai-service/config.py`). Daftar variabel: [`docs/operations.md`](docs/operations.md) | ✅ |
| FR-A13 | Pagination temuan di halaman sesi surveyor dan review admin (12 kartu per halaman, atas data yang sudah dimuat) | ✅ |
| FR-A14 | Batas durasi video 2 menit, divalidasi ffprobe di server dan di browser | ✅ |
| FR-A12 | Rate limiting login | ❌ |

## 10. Non-Goals (Out of Scope)

Tetap berlaku dari v1.0:

- Tidak ada aplikasi mobile native; sistem berupa web responsif.
- Tidak ada mode offline penuh; upload, processing, dan submit butuh internet.
- Tidak ada training atau fine-tuning model; kustomisasi lewat konfigurasi dan prompt.
- Tidak ada pelacakan posisi GPS surveyor secara terus-menerus.
- Tidak ada notifikasi email/push dan tidak ada laporan PDF otomatis.
- Tidak ada undo/trash bin; penghapusan permanen.
- Surveyor tidak dapat mengedit bounding box.
- Dedup lintas gambar tanpa hubungan temporal bukan fitur MVP.

Ditambahkan di v2.0/v2.1:

- Video lebih dari 2 menit (K2).
- Autentikasi eksternal (OAuth/SSO) dan Supabase Auth (K1).
- Penyimpanan file media asli beresolusi penuh (K7).

## 11. Design Considerations

Prinsip UI dari v1.0 tetap berlaku (fokus penggunaan lapangan, status sesi dan status media terlihat terpisah, `Akhiri Survei` dan `Submit` tidak tampak sama, konfirmasi hapus, overlay canvas). Yang sudah ada di UI saat ini:

- Halaman surveyor: daftar sesi, buat sesi (peta), detail sesi dengan tiga tab: **Findings** (per kelas), **Media**, **History** (SubmissionVersion).
- Halaman admin: Dashboard, Reviews (antrean dan detail), Kelas, Model AI, Users.
- Komponen: `MapPicker`, `MediaInspectionModal` (inspeksi media dengan overlay bbox dan hasil SAM3 via `Sam3Result`), `AuditTimeline`, `LeafletDashboardMap`, `FindingLocationMap`.
- Pagination temuan sudah ada (kartu per halaman). Belum ada: pesan alasan submit tidak aktif yang selengkap PRD (submit hanya memblokir dengan pesan error dari API), UI kelas saling eksklusif.

## 12. Technical Considerations

### 12.1 Komponen

| Komponen | Teknologi | Peran |
|---|---|---|
| `web/` | Next.js 16 (App Router), React 19, Tailwind, Prisma 6, Leaflet | UI, API bisnis, auth, storage, orkestrasi job |
| `ai-service/` | Python, FastAPI, Pydantic, httpx, (opsional) torch + ultralytics + opencv | Inferensi VLM, job SAM3, dedup, konflik |
| Database | PostgreSQL (Supabase, lewat pooler `DATABASE_URL` dan `DIRECT_URL` untuk migrasi) | Data aplikasi |
| Storage | Supabase Storage, bucket `img` dan `vids` (publik) | Media terkompresi dan hasil anotasi |

Detail lengkap ada di [`docs/architecture.md`](docs/architecture.md).

### 12.2 Alur pemrosesan (saat ini)

1. `POST /api/media/upload`: validasi sesi dan status, untuk video ukur durasi dengan ffprobe dan tolak bila > batas, kompres dengan ffmpeg, unggah ke bucket, buat `MediaAsset` (`uploaded`, `durationSeconds` dari ffprobe), catat audit.
2. `POST /api/media/{id}/process` (dipicu UI atau `retry`): tandai `processing`, ambil kelas aktif dan model default aktif.
3. **Jika provider `sam3`**: filter kelas ber-`samPrompt`, jalankan `runSam3Job` di background (balas `202`). Job memanggil `POST /api/v1/sam3/jobs`, polling tiap 3 detik (maksimal 1 jam), lalu menulis `MediaSegment` dan `Detection` dalam satu transaksi.
4. **Jika provider VLM**: kirim `POST /api/v1/process-media` ke FastAPI, terima segmen dan detection, simpan dalam satu transaksi (hapus data lama media itu terlebih dahulu).
5. Media menjadi `completed` atau `failed` (dengan `errorMessage`).

Batasan yang diketahui pada langkah 4:

- Untuk video, worker memakai durasi tetap 15 detik dan mengirim bytes video (base64) sebagai satu "gambar" ke model untuk tiap titik sampel. Ini **bukan ekstraksi frame nyata** dan harus diganti (ffmpeg di FastAPI) atau video pada jalur VLM ditolak eksplisit.
- Indeks segmen pada Detection dihitung dari `timestamp / 10`.

### 12.3 Database

Prisma schema adalah source of truth. Migrasi di `web/prisma/migrations/`: `init_supabase_schema`, `add_sam_prompt`, `add_model_sam_mode`. Field JSON disimpan sebagai `String` (`bbox`, `snapshotData`, `mutuallyExclusiveWith`, `conflictDetails`, `extractionMetadata`, `locationGeojson`) sehingga tidak dapat di-query dengan operator JSON PostgreSQL.

### 12.4 Storage

- Upload: Next.js membuat file sementara, ffmpeg mengompres, lalu `supabase-js` (service role) mengunggah ke `sessions/{sessionId}/{uuid}.{webp|mp4}`.
- Bucket publik, URL publik disimpan di `MediaAsset.fileUrl`. Penghapusan media menghapus objek terkait (`removeStoredFile`).
- FastAPI mengunggah video anotasi SAM3 ke `vids` lewat REST Supabase (`services/storage.py`).
- Data lama berformat `/uploads/...` (lokal) masih dapat dibaca oleh worker (kompatibilitas).

### 12.5 Abstraksi provider

`BaseVisionProvider.detect(image_base64, active_classes, timestamp_seconds, frame_index) -> DetectionSchema`. Implementasi: `OpenRouterProvider` (parsing bbox multi-format, log debug), `OnPremiseProvider`. SAM3 di luar interface ini (job berbasis file).

### 12.6 Konstruksi prompt (VLM)

Instruksi sistem tetap, instruksi skema output, daftar kelas aktif dengan deskripsi visual, kriteria kondisi, kriteria kelayakan, dan aturan saling eksklusif. Untuk SAM3, prompt adalah frasa singkat `samPrompt` per kelas.

### 12.7 Keamanan

| Topik | Kondisi |
|---|---|
| Password | bcrypt (cost 10) ✅ |
| Sesi | JWT HS256 (umur dari `SESSION_MAX_AGE_SECONDS`), cookie `httpOnly`, `sameSite=lax`, `secure` di production ✅ |
| Secret model | AES-256-CBC, kunci dari `ENCRYPTION_SECRET_KEY` ✅ (tanpa fallback di kode) |
| `JWT_SECRET` | wajib dari env, tanpa fallback ✅ (K6). Nilai lama yang pernah ada di kode/riwayat git harus dianggap bocor dan tidak boleh dipakai |
| `INTERNAL_API_SECRET` dan `ENCRYPTION_SECRET_KEY` (sisi web) | wajib dari env, tanpa fallback ✅ |
| `INTERNAL_API_SECRET` (FastAPI) | wajib, service menolak start tanpanya ✅ |
| CORS FastAPI | origin dari env, `allow_credentials=False`, metode `GET`/`POST` ✅ |
| Auth saat database bermasalah | `getCurrentUser` jatuh kembali ke payload JWT yang valid (fail-open) 🟡 |
| Rate limit login | belum ada ❌ |
| SSRF pada `file_url` di FastAPI | belum ada allowlist ❌ |
| Proteksi halaman | `src/proxy.ts` memeriksa JWT (tanda tangan dan masa berlaku) ✅. API tetap memeriksa ulang ke database |

Daftar lengkap temuan review kode dan statusnya ada di [`docs/prd-gap-analysis.md`](docs/prd-gap-analysis.md).

### 12.8 Model Lokasi

`SurveySession` menyimpan lokasi utama (GeoJSON). `Detection` menyimpan salinan `locationGeojson` (default lokasi sesi), sehingga peta selalu memiliki koordinat ✅.

## 13. Success Metrics

Tidak berubah dari v1.0:

- Surveyor menyelesaikan satu sesi dari pembuatan sampai submit tanpa input manual berlebihan.
- Status processing setiap media jelas.
- Nol Detection duplikat akibat retry.
- Riwayat `SubmissionVersion` utuh setelah re-submit.
- Data final tidak berubah karena perubahan konfigurasi kelas atau model di masa depan.
- Dashboard hanya berisi data yang disetujui.
- Konflik belum selesai sebelum submit = 0.
- P95 waktu processing gambar dan video 10 detik ditentukan setelah benchmark. Sebagai acuan awal, SAM3 pada video berjalan berupa menit sehingga UI harus memakai polling (sudah).
- Kualitas AI dievaluasi dari rasio approve/reject dan frekuensi koreksi admin. Datanya sudah ada di `AuditLog` (`CORRECT_DETECTION`, `REJECT_SURVEY`), tetapi belum ada laporan.

## 14. Open Questions

### Terjawab oleh implementasi

| Pertanyaan v1.0 | Jawaban saat ini |
|---|---|
| Daftar alasan reject? Fixed atau dikelola admin? | Fixed: 6 opsi di UI (lihat US-007). Belum dapat dikelola admin |
| Field Detection yang boleh diedit admin? | Kelas, kondisi, kelayakan (dan catatan). Bbox tidak |
| Format media didukung? | UI: JPG, PNG, MP4. Server juga menerima MOV/WebM/MKV |
| Encryption key? | Application-managed lewat `ENCRYPTION_SECRET_KEY` |
| Perlu menyimpan file asli? | Tidak. Hanya hasil kompresi yang disimpan (K7) |
| Maksimal durasi video? | 2 menit (K2). Ukuran byte dan jumlah media belum ditetapkan |
| Autentikasi Supabase Auth atau sendiri? | Sendiri: JWT + bcrypt (K1) |
| Model on-premise awal? | Belum ditentukan. Provider `onpremise` menerima `endpoint_url` bebas |
| Bolehkah revision draft menambah media baru? | Ya |

### Masih terbuka

1. Haruskah dashboard dan pelaporan membaca `snapshotData` versi yang disetujui (benar-benar immutable), atau tetap `Detection` hidup?
2. Apakah koreksi admin setelah approve tetap diizinkan? Saat ini tidak ada larangan di level data selain status sesi.
3. Berapa maksimal ukuran byte gambar/video dan jumlah media per sesi (FR-87)? (Durasi video sudah 2 menit.)
4. Berapa lama file terkompresi disimpan?
5. Perlukah raw AI response disimpan (FR-18), dan berapa lama?
6. Apakah video pada jalur VLM akan dibangun ulang dengan ekstraksi frame nyata, atau jalur VLM dibatasi untuk gambar dan video hanya untuk SAM3?
7. Dengan batas 2 menit, apakah video SAM3 tetap satu segmen, atau tetap dipecah ≤10 detik?
8. Apakah kelayakan berbasis luas area pada SAM3 cukup, atau perlu kriteria per kelas?
9. Apakah `sameSite`/`Secure` cookie dan akses lewat HTTPS Tailscale menjadi bentuk deployment standar (lihat [`docs/operations.md`](docs/operations.md))?
10. Apakah semua admin memiliki hak yang sama atas konfigurasi model dan kelas, dan apakah perubahan kelas memerlukan approval?
11. Apakah mengganti model default saat ada job berjalan diizinkan? (Job SAM3 membaca konfigurasi saat dimulai sehingga tidak terpengaruh.)
12. Perlukah batas waktu maksimum sesi, dan bolehkah `selesai_menunggu_submit` dibuka kembali?
