# Dokumentasi BIMA Vision

Indeks dokumentasi proyek. Semua dokumen ditulis dari kode pada 2026-09-21 dan menyebut lokasi file sumbernya agar mudah diverifikasi ulang.

| Dokumen | Isi | Untuk siapa |
|---|---|---|
| [`../PRD_ Aplikasi Web AI Pemantauan Kawasan.md`](../PRD_%20Aplikasi%20Web%20AI%20Pemantauan%20Kawasan.md) | PRD v2.0: tujuan, aturan domain, user story, kebutuhan fungsional dengan status implementasi | Semua anggota tim, pemangku kepentingan |
| [`architecture.md`](architecture.md) | Komponen, alur data, alur pemrosesan media, autentikasi, storage | Developer baru, reviewer |
| [`data-model.md`](data-model.md) | Skema database, relasi, field JSON, versioning | Developer backend |
| [`api-reference.md`](api-reference.md) | Seluruh endpoint Next.js dan FastAPI (peran, aturan, respons) | Developer frontend/backend |
| [`ai-service.md`](ai-service.md) | Provider VLM, pipeline SAM3, konfigurasi, batasan | Developer AI |
| [`operations.md`](operations.md) | Menjalankan, deploy sebagai service, HTTPS Tailscale, troubleshooting | Siapa pun yang mengelola server |
| [`prd-gap-analysis.md`](prd-gap-analysis.md) | Selisih PRD vs kode, status temuan code review, backlog prioritas | Product owner, tech lead |
| [`code-review/`](code-review/README.md) | Hasil code review sebelumnya (snapshot) | Reviewer |

## Peta singkat repositori

```
bima-web/
├── web/            Next.js 16 + Prisma: UI, API bisnis, auth, storage, orkestrasi job
├── ai-service/     FastAPI: inferensi VLM, job SAM3, dedup, deteksi konflik
├── docs/           Dokumentasi ini
├── skills/         Skill/panduan untuk asisten kode (bukan bagian aplikasi)
└── PRD_ ....md     PRD v2.0
```

## Konvensi

- Bahasa antarmuka dan pesan galat: Indonesia. Nama kode dan endpoint: Inggris.
- Status sesi memakai istilah Indonesia (`berlangsung`, `selesai_menunggu_submit`, `menunggu_review`, `disetujui`, `ditolak`, `perlu_perbaikan`).
- Simbol status pada dokumen: ✅ sesuai, 🟡 sebagian, 🔄 berbeda dari PRD lama, ❌ belum ada, ➕ fitur baru.

## Memperbarui dokumentasi

Saat mengubah perilaku, perbarui dokumen yang relevan pada PR yang sama:

- Ubah skema atau state machine: `data-model.md`, PRD bagian 3-5.
- Tambah/ubah endpoint: `api-reference.md`.
- Ubah pipeline atau provider AI: `ai-service.md`, PRD bagian 7 dan 12.
- Ubah cara menjalankan/deploy: `operations.md` dan README di root.
- Menutup celah dari `prd-gap-analysis.md`: ubah statusnya di sana dan di tabel FR pada PRD.
