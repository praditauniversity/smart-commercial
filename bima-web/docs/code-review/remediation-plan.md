# Remediation Plan — BIMA Vision

Urutan prioritas perbaikan berdasarkan hasil review
(lihat [`ai-service-review.md`](./ai-service-review.md) dan [`web-review.md`](./web-review.md)).

## Prioritas 1 — Keamanan kritis (blokir production)

| # | Masalah | Lokasi | Estimasi effort |
|---|---------|--------|-----------------|
| 1 | Hapus fallback secret hardcoded (JWT, ENCRYPTION_KEY, INTERNAL_API_SECRET) → fail-closed | `web/src/lib/security.ts`, `ai-service/main.py` | Kecil |
| 2 | Perbaiki CORS wildcard + credentials | `ai-service/main.py` | Kecil |
| 3 | Jangan log nilai secret saat auth gagal | `ai-service/main.py` | Trivial |

## Prioritas 2 — Bug fungsional

| # | Masalah | Lokasi | Estimasi effort |
|---|---------|--------|-----------------|
| 4 | Ekstraksi frame video nyata (atau tolak `file_type=video` eksplisit) + kirim durasi asli | `ai-service/main.py`, `api/media/[id]/process/route.ts` | Besar |
| 5 | Fallback auth saat DB down harus fail-closed | `web/src/lib/auth.ts` | Kecil |
| 6 | Validasi status sesi di `resolve-conflict` | `api/detections/[id]/resolve-conflict/route.ts` | Kecil |
| 7 | PATCH model: unset default lain saat set default baru | `api/admin/models/[id]/route.ts` | Kecil |
| 8 | Soft-delete class: invalidate cache + audit log di kedua cabang | `api/admin/classes/[id]/route.ts` | Kecil |

## Prioritas 3 — Hardening

| # | Masalah | Lokasi | Estimasi effort |
|---|---------|--------|-----------------|
| 9 | Batas ukuran + whitelist tipe upload; async file write | `api/media/upload/route.ts` | Sedang |
| 10 | Rate limiting login | `api/auth/login/route.ts` | Sedang |
| 11 | Whitelist URL untuk mitigasi SSRF | `ai-service/main.py` | Sedang |
| 12 | Pagination endpoint list/dashboard | `api/sessions`, `api/dashboard/*` | Sedang |

## Prioritas 4 — Kebersihan kode (opsional)

- Ekstrak helper snapshot bersama (`submit` vs `resubmit`).
- Simpan capture live ke disk, bukan base64 di DB.
- Refactor `_parse_bbox` menjadi dispatcher format.
- Bersihkan dead code (`MockVisionProvider`) atau sambungkan ke `get_provider`.
- Perkuat tiping (`any` → tipe Prisma/eksplisit).

## Strategi Pengiriman

Sesuai disiplin change sizing: kerjakan **satu perubahan kecil per item**,
mulai dari Prioritas 1 (masing-masing ~<50 baris). Item #4 cukup besar —
pisahkan menjadi: (a) validasi/tolak video dulu, lalu (b) implementasi ekstraksi frame.
