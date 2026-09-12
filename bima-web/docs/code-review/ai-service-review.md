# Code Review — AI Service (`ai-service/`)

Tanggal review: 2026-08-24
Cakupan: `main.py`, `schemas.py`, `providers/*`, `services/*`, `test_ai_service.py`

---

## Critical

### 1. Video processing mengirim byte video sebagai gambar — tidak ada ekstraksi frame nyata

**Lokasi:** `ai-service/main.py` → `process_media()`

Untuk `file_type == "video"`, seluruh file video di-encode ke base64 dan dikirim
sebagai `image_base64` ke vision provider untuk setiap "frame sampel":

```python
image_base64 = base64.b64encode(resp.content).decode("utf-8")  # ini byte VIDEO, bukan frame
...
for f_idx, t_sample in enumerate(t_samples):
    frame_det = await provider.detect(image_base64=image_base64, ...)
```

`plan_video_segments()` hanya merencanakan segmen; tidak pernah ada ekstraksi frame
sungguhan (mis. via ffmpeg/OpenCV). Model vision menerima byte video seolah-olah gambar.
**Fitur pemecahan video efektifnya tidak berfungsi.**

**Remediasi:** Ekstrak frame nyata per segmen (ffmpeg/OpenCV) sebelum inferensi,
atau tolak eksplisit `file_type == "video"` sampai implementasinya siap.

### 2. Default internal secret yang hardcoded

**Lokasi:** `ai-service/main.py`

```python
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET", "bima-research-internal-secret-2026")
```

Jika env var tidak diset, service dilindungi secret default yang diketahui publik
(nilainya juga muncul di kode web). **Fail-closed** lebih aman: gagal start bila env var kosong.

**Remediasi:**

```python
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET")
if not INTERNAL_SECRET:
    raise RuntimeError("INTERNAL_API_SECRET wajib diisi")
```

---

## Required

### 3. CORS wildcard + credentials

**Lokasi:** `ai-service/main.py`

```python
allow_origins=["*"],
allow_credentials=True,
```

Kombinasi ini tidak valid secara semantik dan berbahaya — memungkinkan request
cross-origin berkredensial dari origin mana pun.

**Remediasi:** Daftar origin eksplisit (mis. `http://localhost:3000`), atau matikan
`allow_credentials` jika memang tidak dibutuhkan (auth sudah via header internal secret).

### 4. Nilai secret tercatat di log saat auth gagal

**Lokasi:** `ai-service/main.py` → `verify_internal_secret()`

```python
logger.warning(f"Unauthorized internal API access attempt: {x_internal_secret}")
```

Mencatat nilai secret yang dikirim ke log — kebocoran secret.

**Remediasi:** Log tanpa nilai: `logger.warning("Unauthorized internal API access attempt")`.

### 5. Permukaan SSRF pada `process_media`

Endpoint mengambil `file_url` arbitrer (`http://`, `https://`, path lokal). Jika
internal secret bocor, ini menjadi vektor SSRF untuk menjangkau host internal.

**Remediasi:** Whitelist skema/host (hanya URL dari domain aplikasi sendiri atau
path `/uploads/` yang tervalidasi).

### 6. Durasi video di-hardcode

```python
video_duration = 15.0  # default estimated duration if not parsed from metadata
```

Nilai `durationSeconds` asli dari database tidak pernah dikirim ke AI service —
`ProcessMediaRequest` bahkan tidak punya field durasi. Segmen yang direncanakan
tidak sesuai durasi video sebenarnya.

**Remediasi:** Tambahkan field `duration_seconds` pada `ProcessMediaRequest`,
isi dari `MediaAsset.durationSeconds` di route `process`.

---

## Nit / Optional

| Temuan | Lokasi | Catatan |
|--------|--------|---------|
| Dead code: `MockVisionProvider` tidak pernah dipakai | `providers/mock.py` | `get_provider()` tidak punya cabang `mock`; tidak dapat dijangkau |
| `print()` alih-alih logger; body response bisa berisi data sensitif | `providers/openrouter.py` | Gunakan `logger.error` |
| `_parse_bbox` rantai kondisional panjang | `providers/openrouter.py` | Kandidat refactor menjadi dispatcher tipe format bbox |
| `test_connection` pakai `.replace("/vision", "/health")` yang rapuh | `providers/onpremise.py` | Simpan base URL terpisah |
| Dedup temporal menyimpan deteksi *pertama*, bukan confidence tertinggi | `services/deduplication.py` | Pertimbangkan keep-best-by-confidence |

---

## Hal yang Sudah Baik

- Abstraksi provider (`BaseVisionProvider`) bersih dan mudah diperluas.
- Parser bbox defensif dengan normalisasi skala 0–1000 / 0–1 dan swap min/max.
- Validasi Pydantic ketat pada schema (batas ge/le pada BBox).
- Unit test untuk IoU, segmentasi, dedup, dan conflict detection cukup bermakna
  (menguji perilaku, bukan detail implementasi).
