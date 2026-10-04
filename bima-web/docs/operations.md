# Operasional: Menjalankan, Deploy, dan Troubleshooting

Panduan ini mencakup dua mode: **development** (laptop) dan **server tetap** (satu PC Linux yang menjalankan aplikasi terus-menerus, diakses lewat Tailscale). Bagian server tetap mencerminkan konfigurasi yang dipakai saat ini. Nilai spesifik lingkungan ditulis sebagai `<placeholder>`.

## 1. Prasyarat

| Kebutuhan | Versi/keterangan |
|---|---|
| Node.js | 22 (dipakai saat ini) dan npm |
| Python | 3.10+ |
| ffmpeg | Build dengan `libx264` dan `libwebp` (`/usr/bin/ffmpeg`). Build anaconda **tidak** punya libx264 |
| Database | Cloud Supabase atau self-hosted Supabase Docker + bucket Storage `img` dan `vids` (publik) |
| GPU (opsional) | Untuk provider `sam3`: CUDA, torch, ultralytics, bobot SAM 3.1 |
| Tailscale (opsional) | Untuk akses jarak jauh dengan HTTPS |

## 2. Variabel lingkungan

### `web/.env` (contoh: `web/.env.example`)

**Aturan:** tidak ada nilai lingkungan yang di-hardcode di kode. Setiap variabel di bawah wajib ada; bila kosong, fitur yang memakainya berhenti dengan galat yang menyebut nama variabelnya (`src/lib/env.ts`). Variabel `NEXT_PUBLIC_*` ditanam ke browser saat `npm run build`, jadi ubah nilainya lalu build ulang dan restart.

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL. Untuk Docker, Bima memakai `supabase-db:5432` di jaringan privat; host migration memakai port loopback `5433` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL HTTPS Storage yang dapat dicapai browser; perubahan perlu build ulang |
| `SUPABASE_INTERNAL_URL` | Opsional: URL Storage server-ke-server. Docker Compose menetapkannya ke `http://supabase-api:8000` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Tersimpan untuk kompatibilitas; aplikasi tidak memakai Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Hanya server: upload/hapus objek Storage. Untuk local Supabase, salin `SERVICE_ROLE_KEY` dari `supabase/.env`. **Rahasia** |
| `JWT_SECRET` | Penandatangan sesi login. **Rahasia**, acak dan panjang (`openssl rand -base64 48`) |
| `ENCRYPTION_SECRET_KEY` | Kunci enkripsi API key model. **Rahasia** |
| `INTERNAL_API_SECRET` | Rahasia bersama dengan ai-service. **Harus sama** di kedua `.env`. **Rahasia** |
| `FASTAPI_SERVICE_URL` | URL ai-service dari sisi server web (loopback, mis. `http://127.0.0.1:8000`) |
| `SESSION_MAX_AGE_SECONDS` | Umur sesi login (JWT dan cookie), dalam detik |
| `USER_CACHE_TTL_MS` | Lama cache pemeriksaan `isActive` user di API, dalam ms |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Path ffmpeg dan ffprobe (butuh libx264 dan libwebp) |
| `FFPROBE_TIMEOUT_MS`, `FFMPEG_IMAGE_TIMEOUT_MS`, `FFMPEG_VIDEO_TIMEOUT_MS` | Batas waktu proses media, ms |
| `MEDIA_IMAGE_MAX_SIDE`, `MEDIA_IMAGE_QUALITY` | Sisi terpanjang dan kualitas WebP gambar |
| `MEDIA_VIDEO_MAX_HEIGHT`, `MEDIA_VIDEO_CRF` | Tinggi maksimum dan CRF H.264 video |
| `SAM3_POLL_INTERVAL_MS`, `SAM3_MAX_WAIT_MS` | Interval polling dan batas tunggu job SAM3, ms |
| `DEFAULT_CONFLICT_IOU_THRESHOLD` | Ambang IoU konflik kelas bila kelas tidak menentukan sendiri |
| `ALLOWED_DEV_ORIGINS` | Host/IP yang boleh membuka server dev (dipisah koma; kosong = tidak ada) |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | Tile peta dan teks atribusinya |
| `NEXT_PUBLIC_NOMINATIM_URL` | Base URL geocoding (Nominatim) |
| `NEXT_PUBLIC_MARKER_ICON_URL`, `_ICON_RETINA_URL`, `_ICON_RED_URL`, `_SHADOW_URL` | Gambar marker peta |
| `NEXT_PUBLIC_OPENROUTER_ENDPOINT_URL`, `NEXT_PUBLIC_ONPREMISE_ENDPOINT_URL` | Isi awal endpoint pada form Model AI |
| `NEXT_PUBLIC_DEFAULT_MODEL_NAME`, `NEXT_PUBLIC_DEFAULT_SAM3_MODEL_NAME` | Isi awal nama model pada form Model AI (dan seed) |
| `OPEN_ROUTER_API_KEY` | Opsional: bootstrap API key OpenRouter bila model belum punya |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_SURVEYOR_EMAIL`, `SEED_SURVEYOR_PASSWORD`, `SEED_SUPERVISOR_EMAIL`, `SEED_SUPERVISOR_PASSWORD`, `SEED_ONPREMISE_MODEL_NAME` | Hanya untuk `npm run seed` dan skrip `prisma/test_*.ts`. Tentukan kredensial sendiri, tidak ada nilai bawaan |
| `NEXT_PUBLIC_API_URL` | Tersisa di `.env.example`; tidak dipakai kode `src/` saat ini |

> **Nilai rahasia yang pernah tertulis di kode atau riwayat git harus dianggap bocor** (termasuk nilai bawaan lama `JWT_SECRET`, `ENCRYPTION_SECRET_KEY`, `INTERNAL_API_SECRET`). Siapa pun yang mengetahuinya dapat menerbitkan cookie sesi admin palsu atau memanggil ai-service. Ganti dengan nilai acak baru, lalu restart. Mengganti `JWT_SECRET` membuat semua pengguna login ulang; mengganti `ENCRYPTION_SECRET_KEY` membuat API key model yang tersimpan tidak terbaca lagi dan harus diisi ulang di menu Model AI.

### `ai-service/.env` (contoh: `ai-service/.env.example`)

Lihat tabel lengkap di [`ai-service.md`](ai-service.md#3-konfigurasi-ai-serviceenv). Sama seperti web, tidak ada nilai bawaan di kode: `INTERNAL_API_SECRET`, `AI_SERVICE_ALLOWED_ORIGINS`, `AI_SERVICE_HOST`, `AI_SERVICE_PORT` selalu wajib, dan variabel SAM3/OpenRouter wajib saat provider itu dipakai.

**Aturan URL antar-service:** karena web dan ai-service berjalan di mesin yang sama dan saling memanggil dari sisi server, gunakan **loopback** (`127.0.0.1`), bukan IP jaringan. Dengan begitu tidak ada yang perlu diedit saat IP atau nama host berubah.

| Variabel | Nilai yang disarankan |
|---|---|
| `web/.env` → `FASTAPI_SERVICE_URL` | `http://127.0.0.1:8000` |
| `ai-service/.env` → `WEB_BASE_URL` | `http://127.0.0.1:3000` |
| `ai-service/.env` → `AI_SERVICE_ALLOWED_ORIGINS` | Origin web yang dipakai pengguna (mis. `https://<host>.<tailnet>.ts.net:8443`), hanya bila ai-service perlu dipanggil dari browser (saat ini tidak) |

## 3. Development

```bash
# Terminal 1: AI service
cd ai-service && source venv/bin/activate && python main.py

# Terminal 2: Web
cd web
npm install
cp .env.example .env            # isi nilainya
npx prisma generate
npx prisma migrate deploy       # terapkan migrasi ke database
npm run seed                    # akun dan kelas awal
npm run seed:sam3               # opsional: SAM prompt dan model SAM3
npm run dev
```

Web di `http://localhost:3000`. Pada mode dev cookie login tidak bertanda `Secure`, jadi login bekerja lewat HTTP biasa. `next.config.ts` memuat `allowedDevOrigins` (IP LAN) untuk mengakses server dev dari perangkat lain.

Tes dan pemeriksaan:

```bash
cd ai-service && pytest
cd web && npm run typecheck && npm run lint
```

## 4. Server tetap (production di satu mesin)

Tujuannya: web dan ai-service hidup selama komputer menyala, otomatis start saat boot, tetap jalan walau sesi SSH/terminal/VS Code Remote ditutup, dan URL tidak berubah.

### 4.1 Build

```bash
cd web
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

Mode production membutuhkan `npm run build` ulang setiap kode web berubah. Mode dev (`npm run dev`) tidak.

### 4.2 Service systemd (level user)

Buat dua file di `~/.config/systemd/user/`. Sesuaikan path Python dan direktori.

`bima-ai.service`

```ini
[Unit]
Description=Bima AI service (FastAPI)
After=network.target

[Service]
WorkingDirectory=<path-repo>/ai-service
ExecStart=<path-python>/python main.py
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

`bima-web.service`

```ini
[Unit]
Description=Bima web (Next.js)
After=network.target bima-ai.service

[Service]
WorkingDirectory=<path-repo>/web
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

Aktifkan:

```bash
systemctl --user daemon-reload
systemctl --user enable --now bima-ai.service bima-web.service
loginctl enable-linger $USER          # agar start saat boot tanpa login
```

Verifikasi bahwa service berjalan di luar sesi terminal dan bertahan saat reboot:

```bash
systemctl --user is-active bima-ai bima-web       # active active
systemctl --user is-enabled bima-ai bima-web      # enabled enabled
loginctl show-user $USER -p Linger                # Linger=yes
ss -tlnp | grep -E ':(3000|8000)\b'               # 3000 di 0.0.0.0, 8000 di 127.0.0.1
```

Port: Next.js **3000** (semua antarmuka), FastAPI **8000** (hanya loopback, tidak boleh dibuka ke jaringan). Jika port 3000 sudah dipakai proses lain di mesin, ubah `-p` di unit web dan sesuaikan `WEB_BASE_URL`.

### 4.3 Akses jarak jauh dengan HTTPS (Tailscale)

**Kenapa harus HTTPS:** di production cookie sesi `bima_session` bertanda `Secure`. Browser menolak menyimpan cookie `Secure` dari halaman `http://` (kecuali `localhost`). Gejalanya: login "berhasil", halaman berpindah ke dashboard, tetapi pengguna tetap dianggap belum login (dashboard kosong, tombol "Masuk" masih ada). Jangan melonggarkan flag `Secure`; gunakan HTTPS.

Setup satu kali:

1. Admin console Tailscale → DNS → aktifkan **MagicDNS** dan **HTTPS Certificates**.
2. Pada server: `sudo tailscale set --operator=$USER` (agar tidak perlu sudo berikutnya).
3. Publikasikan Next.js lewat port HTTPS 8443 (Tailscale hanya mengizinkan HTTPS di 443, 8443, 10000):

```bash
tailscale serve --bg --https=8443 3000
tailscale serve status
```

Hasilnya:

```
https://<host>.<tailnet>.ts.net:8443  →  http://127.0.0.1:3000
```

- Port 3000 tidak berubah dan tetap melayani HTTP. Port 8443 hanyalah "gerbang HTTPS" tambahan yang meneruskan ke 3000. Aplikasi lain di mesin (port lain) tidak tersentuh.
- Konfigurasi `tailscale serve --bg` disimpan Tailscale dan bertahan setelah reboot; layanan `tailscaled` harus `enabled`.
- Untuk mematikan: `tailscale serve --https=8443 off`.

**Cara mengakses:**

| Dari mana | URL | Login berfungsi? |
|---|---|---|
| Perangkat dengan Tailscale aktif (di mana pun, termasuk WiFi yang sama dengan server) | `https://<host>.<tailnet>.ts.net:8443` | ✅ |
| Perangkat tanpa Tailscale, di LAN | `http://<ip-lan>:3000` | Halaman terbuka, tetapi login gagal (cookie `Secure` ditolak) |
| Server itu sendiri | `http://localhost:3000` | ✅ (localhost dikecualikan browser) |

Selalu tulis awalan `https://`. Membuka `http://<host>:8443` menghasilkan pesan "Client sent an HTTP request to an HTTPS server".

Pengguna lain harus berada di tailnet yang sama atau node server dibagikan kepada mereka (Tailscale → Machines → Share). Tanpa itu URL tidak akan terbuka.

### 4.4 Setelah komputer mati/menyala lagi

Berjalan otomatis jika: `tailscaled` enabled, kedua service `enabled`, `Linger=yes`, hasil build `web/.next` ada, dan server punya internet (database dan storage berada di Supabase). URL tetap sama karena berbasis nama MagicDNS. Setelah reboot pertama, jalankan langkah verifikasi di 4.2.

Jika disk dienkripsi atau boot menunggu login lokal, service baru mulai setelah itu.

### 4.5 Memperbarui aplikasi

```bash
git pull
cd web && npm ci && npx prisma migrate deploy && npm run build
systemctl --user restart bima-web
systemctl --user restart bima-ai      # bila ai-service atau .env-nya berubah
```

> ⚠️ **Jangan restart saat ada media sedang diproses.** Job SAM3 dijalankan dari proses Next.js dan statusnya ada di memori ai-service. Restart `bima-web` membuat media yang sedang `processing` tertahan di status itu, sedangkan restart `bima-ai` membuatnya menjadi `failed` (job tidak ditemukan). Pulihkan dengan **Retry** pada media terkait, atau, bila tertahan `processing`, memanggil ulang proses lewat `POST /api/media/{id}/retry`. Belum ada sapuan otomatis.

Perubahan `.env` hanya terbaca setelah service di-restart. Variabel `NEXT_PUBLIC_*` tertanam saat build, jadi perlu `npm run build` ulang.

## 5. Deploy dengan Docker

Alternatif dari service systemd (bagian 4.2): web dan ai-service dijalankan sebagai container. Supabase dapat tetap di cloud atau dijalankan lokal dari stack self-hosted di [`supabase/`](../supabase/README.md).

### 5.1 Prasyarat tambahan

| Kebutuhan | Keterangan |
|---|---|
| Docker Engine + Compose v2 | `docker --version`, `docker compose version` |
| NVIDIA Container Toolkit | Wajib agar container ai-service melihat GPU. Driver tetap milik host; tidak perlu memasang CUDA di dalam image |

Pasang toolkit (sekali saja, di host):

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
```

> `systemctl restart docker` menghentikan sementara semua container yang sedang berjalan di mesin ini.

Verifikasi:

```bash
docker run --rm --gpus all nvidia/cuda:13.0.1-base-ubuntu24.04 nvidia-smi
```

### 5.2 Konfigurasi

Container memakai **`web/.env` dan `ai-service/.env` yang sama** dengan cara menjalankan secara native. Hanya nilai yang berbeda di dalam container yang ditimpa oleh `docker-compose.yml` (lihat komentar di file tersebut):

| Service | Ditimpa menjadi | Alasan |
|---|---|---|
| web | `FASTAPI_SERVICE_URL=http://ai-service:8000` | Di jaringan compose, ai-service dipanggil lewat nama service, bukan loopback |
| web | `SUPABASE_INTERNAL_URL` | Kosong memakai URL publik app; isi `http://supabase-api:8000` untuk Supabase lokal |
| ai-service | `AI_SERVICE_HOST=0.0.0.0` | Harus mendengarkan semua interface **di dalam** container |
| ai-service | `SUPABASE_INTERNAL_URL` | Kosong memakai URL app; isi `http://supabase-api:8000` untuk Supabase lokal |
| ai-service | `SAM3_CHECKPOINT=/weights/sam3_1.pt` | Bobot di-mount, bukan ikut di dalam image |
| ai-service | `WEB_BASE_URL=http://web:3000` | Fallback pengambilan file `/uploads/...` lama |

Selain itu, variabel khusus Docker ada di **`bima-web/.env`** (contoh: `bima-web/.env.example`):

```bash
cp .env.example .env
```

| Variabel | Isi |
|---|---|
| `SAM3_WEIGHTS_HOST_PATH` | Path absolut bobot SAM 3.1 di host ini. Di-mount **read-only** ke `/weights/sam3_1.pt`; file itu tidak pernah disalin ke dalam image |
| `WEB_HOST_PORT` | Port host untuk container web (port di dalam container tetap 3000) |
| `WEB_BUILD_TARGET` | `runner` (default) untuk production; `development` menjalankan Next.js dev server di container lokal |
| `WEB_ENV_FILE`, `AI_ENV_FILE` | File konfigurasi app; default memakai file Cloud saat ini. Untuk lokal, arahkan ke salinan `.env.local` |
| `SUPABASE_INTERNAL_URL` | Kosong menggunakan Supabase Cloud dari app `.env`; untuk lokal isi `http://supabase-api:8000` |

Compose menolak start bila path bobot SAM3 atau port web kosong.

Untuk local Supabase, mulai stack di `supabase/` lebih dulu dan pastikan jaringan
`bima-supabase-app` sudah dibuat. Gunakan salinan private `web/.env.local` dan
`ai-service/.env.local`, pilih keduanya melalui `WEB_ENV_FILE` dan `AI_ENV_FILE`,
lalu set root `SUPABASE_INTERNAL_URL=http://supabase-api:8000`. Atur
`NEXT_PUBLIC_SUPABASE_URL` dan `SUPABASE_PUBLIC_URL` ke HTTPS Tailscale gateway;
salin `SERVICE_ROLE_KEY` dari Supabase lokal ke kedua salinan env. Untuk Supabase
Cloud, biarkan `SUPABASE_INTERNAL_URL` kosong dan gunakan app `.env` cloud. Langkah
stack lokal ada di [`supabase/README.md`](../supabase/README.md).

**Tentang `WEB_HOST_PORT`:** pakai port bebas (mis. `3100`) bila server dev native masih jalan di 3000, atau `3000` bila container yang mengambil alih. Tailscale Serve meneruskan ke port tetap, jadi samakan keduanya:

```bash
tailscale serve --bg --https=8443 <WEB_HOST_PORT>
```

### 5.3 Build dan jalankan

```bash
cd bima-web
docker compose build
docker compose up -d
```

Untuk portal Docker lokal dalam mode development, isi `WEB_BUILD_TARGET=development`
di root `.env.local`. Isi `DEMO_LOGIN_ENABLED=true` dan kredensial `SEED_ADMIN_*` /
`SEED_SURVEYOR_*` di `web/.env.local` untuk menampilkan Akses Cepat. Buat ulang web:

```bash
docker compose --env-file .env.local -p bima-web-local up -d --build --no-deps web
```

Migrasi database dijalankan terpisah (tidak otomatis saat start):

```bash
docker compose --profile tools run --rm migrate
```

Periksa status dan log:

```bash
docker compose ps
docker compose logs -f ai-service
```

### 5.4 Hal yang perlu diketahui

- **ai-service tidak mem-publish port.** Ia hanya dapat dihubungi dari jaringan compose, sehingga sifat "loopback saja" tetap terjaga; `X-Internal-Secret` tetap menjaga setiap endpoint. Jangan menambahkan `ports:` pada service ini.
- **web hanya di-publish ke `127.0.0.1:${WEB_HOST_PORT}`.** HTTPS tetap diterminasi Tailscale Serve di host (bagian 4.3). Karena cookie bertanda `Secure` di production, login lewat `http://<ip-lan>:<port>` akan gagal. Container dan proses native dapat berjalan berdampingan selama portnya berbeda.
- **Nilai `NEXT_PUBLIC_*` ditanam saat build.** Mengubahnya di `web/.env` butuh `docker compose build web`, bukan sekadar restart. Saat build, `web/.env` dipasang sebagai BuildKit secret sehingga tidak ikut tersimpan di layer image.
- **GPU dipakai bergantian.** ai-service memakai satu worker dan membongkar model setelah idle (`SAM3_IDLE_UNLOAD_SECONDS`). Jangan menaikkan jumlah replika: satu GPU hanya untuk satu proses. Beban GPU lain di mesin yang sama (mis. Ollama) ikut memakai VRAM yang sama.
- **Image ai-service besar (beberapa GB)** karena roda torch CUDA. Itu wajar dan tidak perlu dioptimasi dengan base image CUDA terpisah: runtime CUDA sudah dibawa oleh wheel torch, driver berasal dari host.

## 6. Log dan pemantauan

```bash
journalctl --user -u bima-web -f
journalctl --user -u bima-ai -f
systemctl --user status bima-web bima-ai
curl -s http://127.0.0.1:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

- `ai-service/openrouter_debug.log` berisi jejak debug OpenRouter (di-gitignore; berpotensi memuat data survei, jangan dibagikan).
- Riwayat aksi pengguna ada di tabel `AuditLog` (ditampilkan lewat `AuditTimeline`).

## 7. Troubleshooting

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| `ModuleNotFoundError: No module named 'fastapi'` | Dependensi belum terpasang di environment Python yang dipakai | `python -m pip install -r requirements.txt` di environment yang sama. Jangan pakai `sudo python` (memakai Python lain) |
| ai-service menolak start: `INTERNAL_API_SECRET ... required` | Variabel kosong | Isi di `ai-service/.env` (sama dengan web) |
| Login berhasil tetapi tetap dianggap belum login | Situs diakses lewat `http://` sementara cookie `Secure` | Akses lewat `https://` (4.3) atau `http://localhost` |
| Membuka `/admin/*` langsung kembali ke `/login` | Belum login atau sesi kedaluwarsa (proxy halaman bekerja) | Login. Surveyor yang membuka `/admin/*` dialihkan ke `/surveyor/sessions` |
| Semua halaman/login galat 500, atau fitur berhenti dengan pesan "Environment variable X belum diisi" | Variabel wajib kosong di `web/.env` atau `ai-service/.env` | Isi variabel yang disebut (lihat `.env.example`), restart service (dan `npm run build` bila `NEXT_PUBLIC_*`). Pesan lengkap ada di `journalctl --user -u bima-web` / `bima-ai` |
| Upload video ditolak karena durasi | Durasi terukur ffprobe melebihi setelan Admin → Batas Media | Potong video atau minta admin menaikkan batas (maksimal 2 menit) |
| Upload video ditolak: durasi tidak terbaca / `ffprobe tidak bisa dijalankan` | File rusak atau `FFPROBE_PATH` salah | Periksa file; set `FFPROBE_PATH` (`which ffprobe`) |
| `Client sent an HTTP request to an HTTPS server` | Membuka `http://...:8443` | Gunakan `https://...:8443` |
| Port 3000 tidak bisa dijangkau | Service web tidak jalan atau firewall | `systemctl --user status bima-web`; `ss -tlnp \| grep 3000` |
| Media tertahan `processing` | Restart saat job berjalan, atau ai-service mati | Retry media; cek `journalctl` kedua service |
| Media `failed`: "SAM3 Error: Job tidak ditemukan" | ai-service restart saat job berjalan | Retry |
| Media `failed`: "Tidak ada kelas aktif dengan SAM Prompt" | Belum ada kelas aktif ber-`samPrompt` | Isi SAM Prompt di menu Kelas atau `npm run seed:sam3` |
| Media `failed`: API key OpenRouter belum dikonfigurasi | Model aktif tanpa key | Isi API key di menu Model AI |
| `test-connection` SAM3: torch/ultralytics belum terpasang | Dependensi opsional belum diinstal | Instal torch, torchvision, ultralytics, opencv-python, numpy |
| Kompresi gagal: `ffmpeg tidak bisa dijalankan` | Path ffmpeg salah atau tanpa libx264 | Set `FFMPEG_PATH` ke `/usr/bin/ffmpeg` |

## 8. Keamanan operasional (ringkas)

- Jangan commit `.env`, bobot SAM, atau service role key (sudah di-gitignore; hanya `*.env.example` yang dilacak).
- Ganti password akun seed sebelum dipakai bersama.
- ai-service hanya boleh mendengarkan loopback. Jangan diekspos lewat `tailscale serve` atau firewall.
- Bagikan kredensial pengguna lewat kanal pribadi, bukan repositori atau catatan bersama.
- Daftar celah keamanan yang masih terbuka: [`prd-gap-analysis.md`](prd-gap-analysis.md#3-keamanan-dan-hardening).
