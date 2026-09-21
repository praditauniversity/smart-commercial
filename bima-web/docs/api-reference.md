# Referensi API

Ada dua API:

1. **API Next.js** (`/api/*`): dipakai UI. Auth lewat cookie `bima_session`.
2. **API FastAPI** (`/api/v1/*`, `/health`): dipakai **hanya** oleh Next.js. Auth lewat header `X-Internal-Secret`.

Notasi peran: **A** = admin, **S** = surveyor (hanya sesi miliknya), **S/A** = keduanya, **publik** = tanpa login.
Semua galat berbentuk `{ "error": "pesan" }`. Kode umum: `401` (belum login), `403` (peran/kepemilikan salah), `404`, `400` (validasi atau status tidak sesuai), `500`.

## 1. API Next.js

### Auth

| Method & path | Peran | Fungsi |
|---|---|---|
| `POST /api/auth/login` | publik | Body `{ email, password }`. Menolak user nonaktif. Menyetel cookie `bima_session` (umur dari `SESSION_MAX_AGE_SECONDS`) dan mengembalikan data user |
| `POST /api/auth/logout` | publik | Menghapus cookie |
| `GET /api/auth/me` | login | Data user saat ini |

### Sesi survei

| Method & path | Peran | Fungsi dan aturan |
|---|---|---|
| `GET /api/sessions` | S/A | Daftar sesi (S: milik sendiri). Menyertakan jumlah media aktif dan detection |
| `POST /api/sessions` | S/A | Buat sesi. Body `{ name, locationType?, locationGeojson?, locationAddress?, surveyDate? }`. `name` wajib. Status awal `berlangsung` |
| `GET /api/sessions/{id}` | S/A | Detail: media (selain `deleted`), detection, riwayat submission |
| `PATCH /api/sessions/{id}` | S/A | Edit metadata. Hanya status `berlangsung`, `selesai_menunggu_submit`, `perlu_perbaikan`. Menulis audit |
| `DELETE /api/sessions/{id}` | S/A | Hapus sesi. Ditolak jika sesi sudah pernah disubmit/direview |
| `POST /api/sessions/{id}/end` | S/A | `berlangsung → selesai_menunggu_submit`, mengisi `finishedAt`. Respons memuat `warnings` (media sedang diproses/gagal) |
| `POST /api/sessions/{id}/submit` | S/A | `selesai_menunggu_submit → menunggu_review`. Guard: tidak ada media `queued/uploading/processing`, tidak ada media `failed`, tidak ada konflik belum selesai. Membuat `SubmissionVersion` (snapshot) |
| `POST /api/sessions/{id}/create-revision` | S/A | `ditolak → perlu_perbaikan` |
| `POST /api/sessions/{id}/resubmit` | S/A | `perlu_perbaikan → menunggu_review` dengan guard yang sama seperti submit. Membuat versi baru |

### Media

| Method & path | Peran | Fungsi dan aturan |
|---|---|---|
| `POST /api/media/upload` | S/A | `multipart/form-data`: `sessionId`, `file`, `durationSeconds?`. Hanya sesi `berlangsung`/`perlu_perbaikan`. Menerima `image/*` dan video (`mp4|mov|webm|mkv`). Video maksimal 2 menit (`NEXT_PUBLIC_MAX_VIDEO_SECONDS`): durasi diukur ffprobe, `400` bila melebihi atau tidak terbaca. Kompres → bucket → `MediaAsset(status=uploaded, durationSeconds=hasil ffprobe)`. Belum ada batas ukuran byte |
| `POST /api/media/{id}/process` | S/A | Memicu pemrosesan AI. SAM3 → `202` (background); VLM → menunggu worker lalu mengembalikan `detectionsCount`/`detections`. `400` jika tidak ada model aktif atau API key OpenRouter kosong |
| `POST /api/media/{id}/retry` | S/A | Proses ulang media (status sesi harus editable). Meneruskan ke `process` |
| `DELETE /api/media/{id}` | S/A | Hapus permanen media, segmen, detection, dan objek bucket. Status sesi harus editable |

### Detection

| Method & path | Peran | Fungsi dan aturan |
|---|---|---|
| `GET /api/detections/{id}` | S/A | Detail detection |
| `PATCH /api/detections/{id}` | S/A | Ubah `classId`, `condition`, `feasibility`, `locationGeojson`. Surveyor hanya saat sesi `berlangsung`/`selesai_menunggu_submit`/`perlu_perbaikan`. Menulis audit dengan diff |
| `DELETE /api/detections/{id}` | S/A | Hapus detection |
| `POST /api/detections/{id}/resolve-conflict` | S/A | Selesaikan konflik (opsional `chosenClassId`). Menyetel `conflictResolved=true`. *Belum memeriksa status sesi* |
| `PATCH /api/detections/{id}/admin-edit` | A | Koreksi admin: `classId`, `condition`, `feasibility`, `notes`. Bbox tidak dapat diubah. Menulis audit |

### Review admin

| Method & path | Peran | Fungsi dan aturan |
|---|---|---|
| `GET /api/admin/reviews?status=` | A | Antrean submission. Default `menunggu_review`; `all` untuk semua. Setiap item memuat `versionNumber` dan `isResubmission` |
| `GET /api/admin/reviews/{submissionId}` | A | Detail submission, sesi, media, detection, riwayat versi |
| `POST /api/admin/reviews/{submissionId}/approve` | A | `menunggu_review → disetujui` (status sesi dan versi) |
| `POST /api/admin/reviews/{submissionId}/reject` | A | Body `{ rejectReason, reviewNotes? }`. `rejectReason` wajib tidak kosong. Status menjadi `ditolak` |

### Dashboard (A)

| Method & path | Parameter | Fungsi |
|---|---|---|
| `GET /api/dashboard/stats` | `startDate`, `endDate`, `classId` | Jumlah sesi disetujui, total temuan, hitungan per kelayakan, per kelas |
| `GET /api/dashboard/class-summary` | `classId` | Ringkasan temuan per kelas dari sesi disetujui |
| `GET /api/dashboard/map-points` | `classId`, `feasibility` | Titik peta temuan dari sesi disetujui |

### Manajemen admin (A)

| Method & path | Fungsi |
|---|---|
| `GET /api/admin/users`, `POST /api/admin/users` | Daftar dan tambah user (`{ email, name, password, role }`) |
| `PATCH /api/admin/users/{id}` | Ubah nama, role, `isActive`, dan password |
| `GET /api/admin/classes`, `POST /api/admin/classes` | Daftar dan tambah kelas. Membuat `ClassDefinitionVersion` v1 |
| `PATCH /api/admin/classes/{id}` | Ubah kelas (`samPrompt`, `samColor`, `mutuallyExclusiveWith`, `conflictIouThreshold`, `isActive`, dll.). Setiap perubahan membuat versi baru |
| `DELETE /api/admin/classes/{id}` | Nonaktifkan jika punya data historis, hapus jika belum pernah dipakai |
| `GET /api/admin/models`, `POST /api/admin/models` | Daftar dan tambah model (`apiKey` dienkripsi; respons hanya `apiKeyMasked`). `samMode` hanya berlaku untuk `sam3` |
| `PATCH /api/admin/models/{id}` | Ubah konfigurasi (apiKey baru dienkripsi ulang) |
| `POST /api/admin/models/{id}/set-default` | Jadikan default (satu default) |
| `POST /api/admin/models/{id}/test` | Tes koneksi lewat FastAPI `test-connection` |
| `DELETE /api/admin/models/{id}` | Soft delete jika punya deteksi historis, selain itu hapus |

## 2. API FastAPI (internal)

Semua endpoint selain `/health` mewajibkan header `X-Internal-Secret` yang cocok dengan `INTERNAL_API_SECRET` (perbandingan constant-time). Service menolak start bila variabel ini kosong. Hanya bind ke `127.0.0.1:8000`.

| Method & path | Fungsi |
|---|---|
| `GET /health` | Status layanan `{status, service, timestamp}` (tanpa auth) |
| `POST /api/v1/process-media` | Jalur VLM: unduh media, panggil provider, dedup, deteksi konflik. Mengembalikan `ProcessMediaResponse` (`success`, `detections`, `segments`, `error_message`) |
| `POST /api/v1/sam3/jobs` | Buat job SAM3 (body sama seperti `process-media`, `ai_model_config.provider = "sam3"`). Balas `202 { job_id }` |
| `GET /api/v1/sam3/jobs/{job_id}` | Status job: `queued` \| `running` \| `completed` \| `failed`, `progress` 0–1, `result` (ProcessMediaResponse) atau `error`. `404` jika service sempat restart |
| `POST /api/v1/test-connection` | Tes koneksi konfigurasi model, mengembalikan `success`, `message`, `latency_ms`. Untuk `sam3`: memeriksa file bobot (`SAM3_CHECKPOINT`) dan keberadaan `torch`/`ultralytics`, tanpa memuat model |

### Skema utama (`ai-service/schemas.py`)

- `BBox { x, y, width, height }` semua 0–1.
- `DetectionItem { class_id, class_name, bbox, condition, feasibility, confidence?, timestamp_seconds?, frame_index?, has_conflict, conflict_details? }`.
- `ClassDef { id, name, display_name?, visual_description, condition_criteria, feasibility_criteria, mutually_exclusive_with[], conflict_iou_threshold?, sam_prompt?, sam_color? }`.
- `ModelConfigPayload { provider, model_name, endpoint_url?, api_key?, sam_mode? }` dengan `provider` ∈ `OpenRouter | onpremise | sam3`.
- `ProcessMediaRequest { session_id, media_asset_id, file_url, file_type, active_classes[], ai_model_config, idempotency_key?, conflict_threshold }`.

## 3. Catatan penggunaan

- Halaman `/admin/*` dan `/surveyor/*` dijaga `src/proxy.ts` (redirect `307` ke `/login`). Endpoint `/api/*` tidak melewati proxy dan menjawab `401/403` sendiri.

- Kirim cookie pada setiap request (`credentials: 'same-origin'` untuk pemanggilan dari halaman yang sama).
- Pemanggilan API dari luar browser (curl, skrip) membutuhkan cookie `bima_session` dari `POST /api/auth/login`. Pada production cookie bertanda `Secure`, jadi uji lewat HTTPS atau `http://localhost`.
- UI memoll media berstatus `processing`; klien lain sebaiknya melakukan hal yang sama.
