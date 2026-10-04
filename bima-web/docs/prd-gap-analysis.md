# Gap Analysis: PRD vs Kode

Tanggal: 2026-09-21 (diperbarui setelah keputusan produk K1-K7 dan implementasinya). Dasar perbandingan: PRD v1.0 (commit `fe14d40`) terhadap `web/` dan `ai-service/` pada working tree saat ini. Hasilnya sudah dituangkan ke [PRD v2.0](../PRD_%20Aplikasi%20Web%20AI%20Pemantauan%20Kawasan.md); dokumen ini merangkum selisih dan urutan penyelesaiannya.

Legenda: ✅ sesuai · 🟡 sebagian · 🔄 berbeda dari PRD · ❌ belum ada · ➕ baru (tidak ada di PRD).

## 1. Ringkasan

| Area | Hasil |
|---|---|
| Domain dan state machine sesi | ✅ Sesuai. Ada perluasan kecil: `perlu_perbaikan` juga boleh upload/edit/hapus media |
| Lifecycle media | 🟡 `queued`/`uploading`/`deleted` tidak dipakai alur aktual; hapus media adalah hard delete |
| Pipeline AI | 🟡 Gambar ✅. Video VLM masih placeholder. SAM3 ➕ menangani video dengan benar dan kini mendeteksi konflik, tetapi tanpa segmen ≤10 detik. Video dibatasi 2 menit |
| Review dan approval | ✅ Lengkap (alasan reject tetap 6 opsi, hak edit admin: kelas, kondisi, kelayakan) |
| Dashboard | 🟡 Berjalan; belum multi-kelas, dan membaca `Detection` hidup, bukan snapshot. Temuan sudah dipaginasi |
| Manajemen kelas dan model | 🟡 Berjalan; UI kelas saling eksklusif dan preview deteksi belum ada |
| Autentikasi | ✅ JWT + bcrypt sendiri (keputusan K1). `JWT_SECRET` wajib dari env; halaman dijaga proxy |
| Storage | ✅ Lewat Next.js dengan kompresi; file asli tidak disimpan (K7). Upload langsung ke Storage tidak dikejar |
| Keamanan | 🟡 Proteksi halaman dan `JWT_SECRET` selesai; semua fallback secret sudah dihapus (FR-A15); sisanya (rate limit, SSRF, dll.) masih terbuka |

## 2. Selisih fungsional (urut prioritas)

### P1: Memengaruhi kebenaran hasil

| # | Selisih | Dampak | Usulan |
|---|---|---|---|
| 1 | Video pada jalur VLM: durasi tetap 15 dtk, bytes video dikirim sebagai satu gambar per titik sampel (`ai-service/main.py`, `process-media`) | Hasil deteksi video VLM tidak dapat diandalkan | Ekstraksi frame nyata dengan ffmpeg (dan durasi asli dari metadata), **atau** menolak `file_type=video` pada VLM dengan pesan jelas dan mengarahkan video ke SAM3. Kerjakan tahap "tolak dulu" sebagai perbaikan cepat |
| 2 | ✅ **Selesai (K3).** Konflik kelas kini berjalan pada SAM3 (gambar dan video, per frame) dan detektor mensyaratkan frame yang sama | Guard submit "konflik = 0" bermakna untuk semua provider | Tersisa: UI untuk mengatur kelas saling eksklusif (item 9) |
| 4 | Job SAM3 tidak tahan restart (jalan di proses Next.js, status di memori FastAPI) | Media tertahan `processing` atau `failed` setelah restart | Sapuan pemulihan: media `processing` lebih lama dari ambang → `failed`; simpan job di tabel DB |
| 5 | `resolve-conflict` tidak memeriksa status sesi | Konflik dapat diubah pada sesi `menunggu_review`/`disetujui` | Validasi status seperti `PATCH /api/detections/{id}` |
| 6 | Dashboard/rekap membaca `Detection` hidup, snapshot tidak dipakai | Koreksi setelah approve mengubah angka "final" | Putuskan (Open Question 1 di PRD): baca snapshot atau kunci koreksi setelah approve |

### P2: Kesesuaian dengan PRD

| # | Selisih | Usulan |
|---|---|---|
| 7 | ✅ **Selesai (K4).** Pagination kartu temuan 12 per halaman di sesi surveyor dan review admin (sisi browser) | Sisi server bila data membesar |
| 8 | Filter multi-kelas di dashboard | `classId` menjadi daftar; ubah UI |
| 9 | UI `mutuallyExclusiveWith` dan `conflictIouThreshold` di menu Kelas | Tambah kontrol di `admin/classes/page.tsx` |
| 10 | Preview/test deteksi kelas sebelum dipakai surveyor | Endpoint uji satu gambar terhadap satu kelas |
| 11 | 🟡 **Sebagian (K2).** Batas durasi video default 2 menit dan dapat diatur admin sampai 2 menit (ffprobe di server + cek browser). Belum: batas ukuran byte dan jumlah media | Tetapkan batas byte dan jumlah media; tolak lebih awal di `upload` |
| 12 | Segmentasi video ≤10 detik (FR-8) | Prioritas turun karena video dibatasi 2 menit. Putuskan (Open Question 7): pecah nyata, atau ubah PRD agar video SAM3 tetap satu segmen |
| 13 | Dialog konfirmasi `Akhiri Survei` dan tombol hapus sesi di UI | Tambah konfirmasi dan tombol (API sudah ada) |
| 14 | Pesan alasan submit tidak aktif yang lengkap di UI | Tampilkan alasan dari guard secara proaktif |
| 17 | Penyimpanan raw AI response (FR-18) | Tabel/kolom audit dengan masa simpan (Open Question 5) |
| 18 | ✅ **Diputuskan (K7):** file asli tidak disimpan, hanya hasil kompresi | PRD diperbarui |
| 19 | Upload langsung ke Storage (FR-70) | Tidak dikejar untuk prototipe; ubah PRD bila tetap lewat Next.js |
| 20 | ✅ **Diputuskan (K1):** autentikasi JWT + bcrypt sendiri | PRD diperbarui |
| 21 | Snapshot prompt penuh pada `Detection` (FR-67) | Simpan hash/versi prompt yang dipakai |

### P3: Kebersihan

| # | Item |
|---|---|
| 22 | Ekstrak pembentuk snapshot bersama (`submit` dan `resubmit` menduplikasi logika) |
| 23 | Hapus `MockVisionProvider` atau sambungkan ke `get_provider` untuk tes |
| 24 | Perkuat tipe (`any` → tipe Prisma) di route API |
| 25 | Field JSON disimpan sebagai `String`; pertimbangkan `Json` untuk query |
| 26 | Perbaiki README `web/` (masih template `create-next-app`) |
| 27 | Perbarui `prisma/test_*.ts` yang berupa skrip uji manual menjadi tes terotomasi atau hapus |

## 3. Keamanan dan hardening

Status ulang temuan dari [`code-review/remediation-plan.md`](code-review/remediation-plan.md) terhadap kode saat ini:

| # | Temuan review | Status sekarang |
|---|---|---|
| 1 | Fallback secret hardcoded (JWT, ENCRYPTION_KEY, INTERNAL_API_SECRET) | ✅ Semua fallback secret dan nilai lingkungan lain sudah dihapus dari web dan ai-service; semuanya wajib dari env (FR-A15) |
| 2 | CORS wildcard + credentials | ✅ Diperbaiki: origin dari env, `allow_credentials=False`, metode dibatasi |
| 3 | Log nilai secret saat auth gagal | ✅ Tidak ada logging nilai secret pada `verify_internal_secret` |
| 4 | Ekstraksi frame video nyata | 🟡 SAM3 ✅. Jalur VLM belum |
| 5 | Fallback auth saat DB down harus fail-closed | ❌ Masih fail-open (`lib/auth.ts` memakai payload JWT) |
| 6 | Validasi status sesi di `resolve-conflict` | ❌ Belum |
| 7 | PATCH model dan default | ✅ `PATCH` tidak lagi mengubah `isDefault`; gunakan `set-default` |
| 8 | Invalidasi cache kelas saat soft-delete | ✅ `invalidateClassCache()` dipanggil pada create, update, dan delete |
| 9 | Batas ukuran + whitelist tipe upload | 🟡 Tipe divalidasi (`image/*`, video). Batas ukuran belum. Penulisan file lokal tidak lagi ada (langsung ke bucket) |
| 10 | Rate limiting login | ❌ Belum |
| 11 | Allowlist URL untuk mitigasi SSRF di ai-service | ❌ Belum (`file_url` diunduh apa adanya, mengikuti redirect pada jalur SAM3) |
| 12 | Pagination endpoint list/dashboard | 🟡 Pagination tampilan temuan selesai (browser). Endpoint list/dashboard belum dipaginasi di server |

Temuan baru (dari perbandingan ini):

| # | Temuan | Risiko | Usulan |
|---|---|---|---|
| S1 | ✅ **Selesai (K5).** `src/proxy.ts` mengalihkan ke `/login` bila JWT tidak ada/tidak valid dan memeriksa role per prefix | Proxy tidak memeriksa `isActive`; API tetap memeriksanya | Tidak ada |
| S2 | Cookie `Secure` di production membutuhkan HTTPS | Login gagal lewat HTTP | Tetap `Secure`; gunakan HTTPS Tailscale ([`operations.md`](operations.md#43-akses-jarak-jauh-dengan-https-tailscale)) |
| S3 | Bucket `img`/`vids` publik dan file dilayani lewat URL publik tak terautentikasi | Siapa pun yang mendapat URL dapat melihat media survei | Bucket privat + signed URL, terutama bila media memuat wajah/plat nomor |
| S4 | Akun seed berkredensial bawaan | Akses admin bila lupa diganti | Wajibkan penggantian password pada login pertama atau buat seed dari env |
| S5 | Nominatim publik dipanggil dari browser | Batas penggunaan (rate limit) dan kebocoran koordinat ke pihak ketiga | Proxy/cache atau penyedia geocoding sendiri untuk beban tinggi |
| S6 | `openrouter_debug.log` berisi jejak permintaan | Data survei di disk | Nonaktifkan di production atau rotasi/hapus berkala |
| S7 | Nilai `JWT_SECRET` yang pernah menjadi nilai bawaan di kode (dan ada di riwayat git) masih dipakai di lingkungan berjalan | Siapa pun yang dapat membaca repositori dapat memalsukan cookie sesi admin (`role: admin`) | **Ganti `JWT_SECRET` dengan nilai acak baru** (`openssl rand -base64 48`) dan restart web; semua pengguna login ulang. Kode kini menolak jalan tanpa nilai, tetapi tidak dapat mengetahui apakah nilai itu masih nilai lama. Berlaku juga untuk `ENCRYPTION_SECRET_KEY` (API key model harus diisi ulang) dan `INTERNAL_API_SECRET` (samakan di kedua `.env`) |

## 4. Fitur baru di kode yang belum ada di PRD (sudah dimasukkan ke PRD v2.0)

- Provider `sam3`, `samPrompt`/`samColor` per kelas, `samMode` per model, job asinkron, idle-unload GPU, video anotasi, ambang confidence temuan, kelayakan heuristik luas.
- Kompresi media saat upload (WebP/H.264) dan Storage lewat Supabase (`media-storage.ts`).
- `AuditLog` menyeluruh dan `AuditTimeline`.
- Koreksi detection oleh surveyor (kelas, kondisi, kelayakan) dan penghapusan detection, dengan audit diff.
- Seed SAM3 (`seed-sam3.ts`).

## 5. Rekomendasi urutan pengerjaan

1. **Keamanan cepat** (kecil): **ganti `JWT_SECRET`, `ENCRYPTION_SECRET_KEY`, dan `INTERNAL_API_SECRET` dengan nilai baru (S7)**, `resolve-conflict` validasi status, auth fail-closed saat DB down. *(Middleware proteksi halaman dan `JWT_SECRET` wajib-env selesai.)*
2. **Kebenaran hasil**: tolak/ganti video VLM (item 1), sapuan pemulihan job (4). *(Konflik SAM3 (2) selesai.)*
3. **Limit dan operasional**: batas ukuran upload, rate limit login, allowlist URL FastAPI.
4. **Keputusan produk** yang masih terbuka: snapshot vs Detection hidup (6), segmentasi video (12). *(Supabase Auth, file asli, upload langsung sudah diputuskan: K1, K7.)*
5. **Kelengkapan UI**: filter multi-kelas, UI kelas saling eksklusif, konfirmasi Akhiri Survei dan tombol hapus sesi, preview deteksi kelas. *(Pagination selesai.)*
