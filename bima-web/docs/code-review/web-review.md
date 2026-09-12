# Code Review — Web (`web/`)

Tanggal review: 2026-08-24
Cakupan: `src/lib/*`, `src/app/api/**`, `prisma/schema.prisma`, komponen & halaman utama

---

## Critical

### 1. Default JWT secret dan encryption key yang hardcoded

**Lokasi:** `web/src/lib/security.ts`

```ts
const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET_KEY || 'bima-aes-encryption-key-32bytes!';
const JWT_SECRET = process.env.JWT_SECRET || 'bima-jwt-super-secret-key-32-chars-min-key!';
```

Jika env var tidak diset, penandatanganan JWT dan enkripsi AES memakai kunci
default yang diketahui publik. Penyerang yang mengetahui default ini dapat
**memalsukan JWT (auth bypass penuh)** atau **mendekripsi API key yang tersimpan**.

**Remediasi:** Fail-closed — throw saat startup bila env var kosong di production.

### 2. Fallback auth mempercayai JWT saat DB down

**Lokasi:** `web/src/lib/auth.ts` → `getCurrentUser()`

```ts
} catch (err) {
  console.warn('DB check failed in getCurrentUser, falling back to verified JWT payload:', err);
  // If DB is temporarily reconnecting, trust the verified cryptographically-signed JWT
  return { userId: payload.userId, ... };
}
```

Saat DB error, user yang sudah **dinonaktifkan** tetap diotorisasi selama outage.
Ini melanggar invariant "user aktif" yang justru menjadi alasan pengecekan DB ada.

**Remediasi:** Return `null` pada kegagalan DB (fail-closed), atau batasi fallback
hanya untuk endpoint non-sensitif dengan TTL sangat pendek.

---

## Required

### 3. Upload media tanpa batas

**Lokasi:** `web/src/app/api/media/upload/route.ts`

Tidak ada validasi ukuran file, content-type, maupun whitelist tipe. Klien jahat
dapat mengunggah file sebesar apa pun (DoS) atau konten arbitrer. Selain itu
`fs.writeFileSync` bersifat sinkron di dalam handler async (mem blokir event loop).

**Remediasi:**
- Batas ukuran (mis. 50 MB) + whitelist MIME (`image/*`, `video/mp4`).
- Gunakan `fs.promises.writeFile`.

### 4. Tidak ada rate limiting pada login

**Lokasi:** `web/src/app/api/auth/login/route.ts`

Endpoint login tanpa throttling → risiko brute-force password.

**Remediasi:** Rate limit per IP+email (mis. 5 percobaan/menit) via middleware
atau library seperti `rate-limiter-flexible`.

### 5. Surveyor dapat resolve conflict pada sesi terkunci

**Lokasi:** `web/src/app/api/detections/[id]/resolve-conflict/route.ts`

Route memeriksa kepemilikan tetapi **tidak memeriksa status sesi**, berbeda dari
route PATCH/DELETE detection yang memvalidasi `editableStatuses`. Surveyor dapat
mengubah deteksi pada sesi berstatus `menunggu_review` / `disetujui` —
melewati pembekuan review.

**Remediasi:** Tambahkan validasi status yang sama seperti route detection lain.

### 6. Bisa ada lebih dari satu model default

**Lokasi:** `web/src/app/api/admin/models/[id]/route.ts` (PATCH)

POST `/api/admin/models` me-unset default lama, tetapi PATCH tidak. Admin dapat
menyisakan beberapa `isDefault: true` — perilaku pemilihan model jadi ambigu
(`findFirst` tanpa ordering deterministik).

**Remediasi:** Dalam PATCH, jika `isDefault === true`, jalankan `updateMany`
untuk unset default lain (idealnya dalam satu transaksi).

### 7. Soft-delete class melewatkan cache invalidation dan audit log

**Lokasi:** `web/src/app/api/admin/classes/[id]/route.ts` (DELETE)

Cabang soft-delete (kelas punya deteksi historis) `return` lebih awal **tanpa**
memanggil `invalidateClassCache()` dan **tanpa** membuat entri `auditLog`.
Akibatnya cache 60 detik menyajikan kelas nonaktif dan jejak audit hilang.

**Remediasi:** Panggil `invalidateClassCache()` dan catat audit log di kedua cabang.

---

## Nit / Optional

| Temuan | Lokasi | Catatan |
|--------|--------|---------|
| Cache user tidak di-invalidate saat user dinonaktifkan | `lib/auth.ts` | User nonaktif bisa terotorisasi hingga 60s |
| `save-capture` menyimpan data URL base64 penuh di kolom DB `fileUrl` | `api/live/save-capture/route.ts` | Inkonsisten dengan upload route yang menulis ke disk; bloat DB |
| Duplikasi logika snapshot antara `submit` dan `resubmit` | `api/sessions/[id]/{submit,resubmit}/route.ts` | Ekstrak helper `buildSubmissionSnapshot(session, user)` bersama |
| `where: any` | `api/sessions/route.ts` | Perkuat tiping |
| Tanpa pagination | `GET /api/sessions`, `dashboard/stats`, `dashboard/map-points`, `dashboard/class-summary` | Unbounded fetch; tambahkan pagination/limit |
| `console.warn` vs `console.error` tidak konsisten | beberapa file | Standarkan |
| `classCache.ts` pakai `any[]` | `lib/classCache.ts` | Tiping dengan tipe Prisma |

---

## Hal yang Sudah Baik

- **State machine** (`lib/state-machine.ts`) eksplisit, tervalidasi server-side,
  dengan pesan penolakan berbahasa pengguna — dipakai konsisten di submit/resubmit/approve/reject.
- **Immutable submission snapshot** per versi + riwayat audit log menyeluruh.
- Enkripsi API key at-rest (AES-256-CBC) dan masking secret di response UI.
- Pemeriksaan kepemilikan (ownership) surveyor konsisten di hampir semua route.
- Soft-delete untuk entitas bersejarah (class/model) menjaga integritas data.
- Transaksi Prisma untuk operasi multi-tabel (submit, delete media, approve).
