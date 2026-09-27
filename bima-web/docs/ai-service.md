# AI Service

Layanan Python (FastAPI) untuk inferensi. Kode di [`ai-service/`](../ai-service/). Layanan ini **stateless terhadap database**: menerima permintaan dari Next.js, memprosesnya, dan mengembalikan hasil.

## 1. Menjalankan

```bash
cd ai-service
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt                       # inti (tanpa GPU)
# untuk provider sam3 (GPU), pakai ini sebagai gantinya:
# pip install -r requirements-gpu.txt --extra-index-url https://download.pytorch.org/whl/cu130
cp .env.example .env                                  # lalu isi
python main.py                                        # host/port dari AI_SERVICE_HOST / AI_SERVICE_PORT
```

- Mendengarkan `AI_SERVICE_HOST`:`AI_SERVICE_PORT` (isi loopback, mis. `127.0.0.1:8000`). Swagger di `/docs`.
- **Semua konfigurasi dari environment, tanpa nilai bawaan di kode.** Variabel yang wajib tetapi kosong menghentikan proses dengan pesan yang menyebut nama variabelnya (`config.py`). `INTERNAL_API_SECRET` harus sama dengan `web/.env`.
- Tes: `pytest` (IoU, perencanaan segmen, dedup temporal, deteksi konflik, grid visual).
- `numpy` dan `opencv` **wajib**: `services/sam3_engine.py` meng-import keduanya pada level modul, sehingga `main.py` tidak bisa start tanpa mereka meski provider `sam3` tidak dipakai. Keduanya ada di `requirements.txt`.
- `torch`, `torchvision`, dan `ultralytics` di-import lazy dan hanya dibutuhkan provider `sam3`. Semuanya ada di `requirements-gpu.txt` dengan versi dipatok, karena terikat pada runtime CUDA dan format bobot SAM 3.1. Service tetap hidup tanpa mereka, tetapi provider `sam3` akan gagal.
- **CLIP wajib untuk SAM3.** Tokenizer teks SAM3 dibangun dari paket `clip`. Bila paket itu tidak ada, ultralytics mencoba `pip install git+...CLIP.git` **saat inferensi pertama**; di container hal itu gagal (`No module named 'clip'`). Karena itu `requirements-gpu.txt` memasangnya lebih awal.
- Menjalankan lewat Docker: lihat [`operations.md`](operations.md#5-deploy-dengan-docker).

## 2. Jalur pemrosesan

Provider dipilih dari `ai_model_config.provider` pada permintaan (berasal dari model default aktif di database).

| Provider | Endpoint yang dipakai Next.js | Mode |
|---|---|---|
| `OpenRouter`, `onpremise` | `POST /api/v1/process-media` | Sinkron: satu request, satu respons |
| `sam3` | `POST /api/v1/sam3/jobs` lalu `GET /api/v1/sam3/jobs/{id}` | Job asinkron dengan polling |

### 2.1 Jalur VLM (`process-media`)

1. Ambil bytes media dari `file_url` (`data:`, `http(s)://`, `/uploads/...` lama, atau path lokal).
2. **Gambar**: satu segmen, satu panggilan `provider.detect(...)`.
3. **Video**: `plan_video_segments(15.0)` (durasi **diasumsikan 15 detik**), tiap segmen mengirim dua titik sampel (awal dan tengah) dengan bytes video yang sama, lalu `deduplicate_temporal_detections(time_window=3.0, iou_threshold=0.45)`.
4. `detect_class_conflicts(...)` menandai pasangan kelas saling eksklusif dengan IoU ≥ threshold.
5. Mengembalikan `ProcessMediaResponse`. Galat ditangkap dan dikembalikan sebagai `success=false` dengan `error_message`.

> ⚠️ Langkah 3 bukan ekstraksi frame nyata. Sampai diperbaiki, gunakan jalur VLM untuk **gambar**, dan SAM3 untuk video. Lihat [`prd-gap-analysis.md`](prd-gap-analysis.md).

### 2.2 Provider VLM

| Provider | File | Catatan |
|---|---|---|
| OpenRouter | `providers/openrouter.py` | Membangun prompt dari kelas aktif, meminta JSON terstruktur, mengurai bbox dari beberapa format (`_parse_bbox`), menulis log debug ke `openrouter_debug.log` (di-gitignore) |
| On-premise | `providers/onpremise.py` | `POST` JSON `{image, ...}` ke `endpoint_url` dari konfigurasi model, atau `ONPREMISE_ENDPOINT_URL` bila kosong (wajib salah satunya), header `Authorization: Bearer` bila ada key |
| Mock | `providers/mock.py` | Tidak tersambung ke `get_provider` (kode mati) |

Kontrak provider (`providers/base.py`): `detect(image_base64, active_classes, timestamp_seconds, frame_index) -> DetectionSchema` dan `test_connection()`.

### 2.3 Jalur SAM3 ➕

Alur satu job (`services/sam3_service.py`). Video dibatasi 20 menit di sisi web (upload):

1. `build_class_prompts`: hanya kelas dengan `sam_prompt` yang dipakai. Warna dari `sam_color` (atau palet bawaan).
2. Materialisasi input ke file lokal (unduh dengan streaming, timeout 300 dtk).
3. **Gambar**: `engine.process_image` → daftar instance (bbox, luas %, confidence). Gambar asli dipakai sebagai media segmen (overlay digambar di klien dari `extraction_metadata.instances`).
4. **Video**: `engine.process_video` → video beranotasi H.264 (dipipa langsung ke ffmpeg), diunggah ke bucket `vids`, `annotated_url` disimpan di metadata. Temuan diambil dari **frame puncak** tiap kelas.
5. `build_detections` (lalu deteksi konflik, lihat 2.4): instance dengan confidence < `SAM3_FINDING_CONF` tidak dijadikan temuan (tetap ada di ringkasan agar slider UI dapat menampilkannya); maksimal 100 temuan per kelas.
6. Kelayakan = heuristik luas area: ≥1% → `tidak_layak`, ≥0,2% → `cukup_layak`, selain itu `layak`. Kondisi berisi ringkasan otomatis (confidence dan luas). Admin dapat mengoreksinya saat review.
7. Hasil: satu `MediaSegmentResult` (`segment_index=0`, `end_time=durasi`, `media_url` = video anotasi atau gambar asli, `extraction_metadata` = ringkasan).

Eksekusi:

- Satu `ThreadPoolExecutor(max_workers=1)`: job berjalan satu per satu agar GPU dimiliki satu proses.
- Status job di memori (`_sam3_jobs`), hingga 200 job terakhir. **Hilang jika service restart.**
- Model dimuat saat dibutuhkan dan dibongkar dari GPU setelah idle `SAM3_IDLE_UNLOAD_SECONDS` (nilai negatif = jangan bongkar).

Mode video (`ModelConfig.samMode`):

| Mode | Perilaku |
|---|---|
| `optimized` (default) | SAM di keyframe tiap 5 frame + propagasi optical-flow (Farneback) di antaranya. Mask halus |
| `fast` | Pergeseran phase-correlation global antar keyframe (interval 8). Lebih cepat, lebih banyak drift |

Batasan SAM3 saat ini:

- Tidak ada dedup temporal: hanya frame puncak per kelas.
- Satu segmen per video (tidak dipecah ≤10 detik). Durasi video dibatasi 20 menit oleh web sebelum sampai ke sini.

### 2.4 Deteksi konflik ➕

Konflik = dua temuan pada frame yang sama, kelas berbeda, keduanya saling eksklusif (`mutually_exclusive_with` berisi id atau nama kelas), dan IoU ≥ `conflict_iou_threshold` kelas (default `conflict_threshold` permintaan, 0,5). Web mengirim kedua field itu dari `ClassDefinition`.

| Jalur | Fungsi | Cara kerja |
|---|---|---|
| VLM dan gambar SAM3 | `detect_class_conflicts` | Membandingkan pasangan temuan dengan `frame_index` sama (keduanya `None` untuk gambar) |
| Video SAM3 | `detect_video_conflicts` | Temuan video adalah instance frame puncak tiap kelas, dan puncak kelas berbeda jarang di frame yang sama. Karena itu yang dibandingkan adalah rekaman instance **per frame** (hanya confidence ≥ `SAM3_FINDING_CONF`). Bila dua kelas eksklusif tumpang tindih di sebuah frame, temuan tiap kelas yang paling cocok (IoU tertinggi, lalu frame terdekat) ditandai konflik |

Hasilnya `has_conflict=true` dan `conflict_details` (`conflicting_with_class`, `conflicting_with_id`, `iou`, `reason`, untuk video juga `conflict_frame_index` dan `conflict_timestamp_seconds`). Jika sebuah temuan berkonflik dengan beberapa lawan, yang disimpan adalah IoU terkuat. Surveyor menyelesaikannya lewat `resolve-conflict` sebelum submit.

## 3. Konfigurasi (`ai-service/.env`)

Tidak ada nilai bawaan di kode. Semua variabel di bawah harus ada di `ai-service/.env` (contoh nilai ada di `.env.example`); yang wajib tetapi kosong menghasilkan galat yang menyebut nama variabelnya. Variabel SAM3 dibaca saat job SAM3 berjalan, sehingga service tetap hidup tanpa mereka selama provider `sam3` tidak dipakai.

| Variabel | Wajib | Fungsi |
|---|---|---|
| `INTERNAL_API_SECRET` | selalu | Rahasia bersama dengan web (service menolak start tanpanya) |
| `AI_SERVICE_ALLOWED_ORIGINS` | selalu | Daftar origin CORS (dipisah koma) |
| `AI_SERVICE_HOST`, `AI_SERVICE_PORT` | saat `python main.py` | Alamat listen. Isi loopback |
| `WEB_BASE_URL` | hanya untuk file lama `/uploads/...` | Base URL web untuk mengambil file lama |
| `OPENROUTER_ENDPOINT_URL` | provider OpenRouter | Endpoint chat completions bila konfigurasi model tidak punya `endpointUrl` |
| `OPENROUTER_AUTH_KEY_URL` | tes koneksi OpenRouter | Endpoint pemeriksaan API key |
| `OPENROUTER_HTTP_REFERER` | opsional | Header `HTTP-Referer` (dihilangkan bila kosong) |
| `ONPREMISE_ENDPOINT_URL` | provider on-premise bila model tanpa endpoint | Endpoint bawaan on-premise |
| `SAM3_CHECKPOINT` | SAM3 | Path bobot SAM 3.1 (unduhan bergerbang, jangan di-commit) |
| `FFMPEG_PATH` | SAM3 video | ffmpeg dengan libx264 (build anaconda tidak punya) |
| `SAM3_IDLE_UNLOAD_SECONDS` | SAM3 | Bongkar model setelah idle (negatif = jangan bongkar) |
| `SAM3_IMGSZ`, `SAM3_CONF` | SAM3 | Ukuran input dan batas confidence model |
| `SAM3_FINDING_CONF` | SAM3 | Batas confidence agar dianggap temuan |
| `SAM3_IMAGE_MAX_SIDE`, `SAM3_IMAGE_MIN_SIDE` | SAM3 gambar | Batas sisi gambar |
| `SAM3_VIDEO_MAX_SIDE`, `SAM3_VIDEO_MAX_FRAMES` | SAM3 video | Batas sisi video dan jumlah frame (0 = seluruhnya) |
| `SAM3_POST_WORKERS` | SAM3 video | Thread pasca-proses |
| `SAM3_OUTPUT_CRF` | SAM3 video | Kualitas H.264 video hasil anotasi |
| `SAM3_DETECT_INTERVAL`, `SAM3_PROPAGATION`, `SAM3_FLOW_SCALE` | opsional | Menimpa preset algoritma `optimized`/`fast` (kosong = pakai preset) |
| `SUPABASE_URL` (atau `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY` | SAM3 video | Upload video anotasi ke bucket `vids` |

Preset algoritma video (`optimized`, `fast`) adalah bagian dari kode (hasil porting notebook), bukan konfigurasi lingkungan.

## 4. Menambah provider VLM baru

1. Buat kelas di `providers/` yang mewarisi `BaseVisionProvider` dan mengembalikan `DetectionSchema`.
2. Daftarkan di `get_provider` (`main.py`) dengan nilai `provider` baru.
3. Izinkan nilai baru itu di UI model (`web/src/app/admin/models/page.tsx`) dan pastikan `api/admin/models` menyimpannya.
4. Tambahkan tes di `test_ai_service.py`.

Aturan: kembalikan hanya kelas dari `active_classes`, bbox normalized 0–1, `feasibility` ∈ {`layak`, `cukup_layak`, `tidak_layak`}.

## 5. Referensi riset

Algoritma SAM3 dipindahkan dari notebook riset di luar repositori ini (`publicspace_vlm`). Folder itu adalah cadangan dan referensi, **tidak diubah** oleh proyek ini. Perbedaan porting: prompt berasal dari database, torch/ultralytics di-import lazy, video anotasi dipipa ke ffmpeg (H.264) alih-alih `VideoWriter('mp4v')`, dan rasio aspek sumber dipertahankan.
