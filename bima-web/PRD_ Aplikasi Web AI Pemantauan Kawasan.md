# PRD: Aplikasi Web AI Pemantauan Kawasan

## 1. Introduction/Overview

Aplikasi web berbasis AI untuk membantu proses survei kondisi infrastruktur di lapangan, seperti rambu jalan rusak, jalan berlubang, dan objek lain yang ditentukan admin. Surveyor membuat sesi survei terlebih dahulu dengan nama, lokasi, tanggal, dan waktu mulai. Selama sesi berlangsung, surveyor dapat mengupload banyak gambar atau video. Setiap media diproses secara asynchronous oleh AI tanpa mengakhiri sesi survei. Surveyor dapat terus menambahkan media selama sesi masih berstatus berlangsung.

Sistem juga menyediakan mode live video. AI mengambil sampel frame secara berkala dan menampilkan hasil deteksi secara near-realtime. Hasil live detection hanya ditampilkan sementara dan tidak otomatis menjadi data survei. Surveyor harus secara eksplisit menyimpan frame atau klip yang ingin dimasukkan ke sesi survei.

Setelah semua media selesai dikumpulkan dan diproses, surveyor menekan tombol terpisah untuk mengakhiri sesi. Sistem mengunci sesi dari upload dan live capture baru. Surveyor kemudian dapat mereview hasil, memperbaiki konflik kelas yang perlu direview, dan menekan tombol submit untuk mengirim hasil ke admin.

Sistem menggunakan model vision language yang dikonfigurasi admin. Model default awal adalah Qwen3 VL 8B Instruct. Model harus menghasilkan data deteksi terstruktur yang berisi kelas objek, bounding box, kondisi, dan tingkat kelayakan. Semua provider AI, baik OpenRouter maupun model on-premise, harus dikonversi ke schema output internal yang sama.

Setiap hasil survei harus direview dan disetujui oleh admin sebelum menjadi data final. Admin dapat mengoreksi data deteksi sesuai hak edit yang ditentukan sistem, menyetujui hasil, atau menolak hasil dengan alasan. Jika ditolak, surveyor dapat membuat revisi melalui alur versioning dan melakukan re-submit tanpa mengubah versi sebelumnya.

Masalah yang diselesaikan adalah proses pendataan kondisi infrastruktur di lapangan yang biasanya dilakukan secara manual. Surveyor tidak perlu mencatat setiap objek secara manual. AI membantu mendeteksi objek, mengidentifikasi kelas, mengevaluasi kondisi, dan menentukan tingkat kelayakan berdasarkan kriteria yang telah ditentukan admin. Setiap hasil tetap memiliki bukti visual, data lokasi, riwayat perubahan, dan jejak proses review.

## 2. Goals

- Surveyor dapat membuat satu sesi survei yang berisi banyak gambar, video, dan hasil capture dari live mode.
- Upload media dan proses AI dapat terus dilakukan selama sesi masih berlangsung tanpa otomatis mengakhiri atau mengirim survei.
- Setiap file asli memiliki lifecycle yang terpisah dari lifecycle sesi survei.
- Proses AI berjalan asynchronous sehingga upload tidak menunggu seluruh proses ekstraksi dan inferensi selesai.
- Hasil deteksi digabung dalam satu sesi survei dan dikelompokkan berdasarkan kelas tanpa membuat submission terpisah untuk setiap file atau batch.
- Setiap objek hasil deteksi direpresentasikan sebagai satu data Detection yang dapat ditelusuri kembali ke media sumber dan versi processing-nya.
- Surveyor dapat menggunakan mode live video untuk melihat overlay deteksi secara near-realtime.
- Hasil live detection tidak otomatis disimpan sebagai data survei. Surveyor harus menyimpan capture secara eksplisit.
- Surveyor dapat mengedit metadata sesi dan menghapus media yang tidak sesuai sebelum mengirim hasil ke admin.
- Sistem dapat mencegah submit jika masih terdapat media yang belum selesai diproses atau konflik kelas yang belum diselesaikan.
- Sistem mendukung deteksi konflik antar kelas yang bersifat saling eksklusif berdasarkan konfigurasi kelas.
- Surveyor dapat mengakhiri sesi secara terpisah dari proses upload dan submit.
- Sistem memiliki alur approval sehingga hasil survei hanya menjadi data final setelah disetujui admin.
- Hasil yang ditolak dapat direvisi dan di-submit kembali melalui versi baru tanpa mengubah riwayat versi sebelumnya.
- Admin dapat mengelola kelas deteksi melalui konfigurasi dan prompt engineering tanpa melakukan retraining model.
- Admin dapat mengelola model AI yang digunakan melalui OpenRouter maupun endpoint on-premise.
- Setiap hasil deteksi menyimpan referensi versi kelas dan konfigurasi model yang digunakan saat proses inferensi.
- Admin memiliki dashboard untuk melihat rekap hasil survei yang telah disetujui secara keseluruhan maupun per kelas.
- Sistem menggunakan state machine eksplisit untuk memastikan aksi tidak dapat melewati tahapan lifecycle yang ditentukan.

## 3. Core Domain Rules

### 3.1 SurveySession

SurveySession adalah container utama untuk seluruh aktivitas satu survei.

Satu SurveySession memiliki:

- Nama survei.
- Lokasi survei berupa titik, area, atau polygon.
- Tanggal survei.
- Waktu mulai.
- Waktu selesai.
- Status sesi.
- Surveyor pemilik sesi.
- Satu atau lebih MediaAsset.
- Satu atau lebih SubmissionVersion.

### 3.2 MediaAsset

MediaAsset merepresentasikan satu file media asli yang diupload atau disimpan dari live capture.

Contoh:

- Satu file JPG menghasilkan satu MediaAsset.
- Satu file PNG menghasilkan satu MediaAsset.
- Satu file video MP4 menghasilkan satu MediaAsset.
- Satu klip yang disimpan dari live mode menghasilkan satu MediaAsset.

MediaAsset memiliki lifecycle processing sendiri dan tidak menggunakan status SurveySession.

Status MediaAsset:

- queued.
- uploading.
- uploaded.
- processing.
- completed.
- failed.
- deleted.

Kegagalan processing satu MediaAsset tidak boleh otomatis mengubah status SurveySession.

Surveyor dapat melakukan retry processing pada MediaAsset yang gagal jika media masih berada dalam sesi yang dapat diedit.

### 3.3 MediaSegment

MediaSegment adalah unit media yang diproses AI.

Untuk gambar:

- Satu MediaAsset memiliki satu MediaSegment.

Untuk video:

- Satu MediaAsset dapat memiliki beberapa MediaSegment.
- Setiap MediaSegment memiliki durasi maksimal 10 detik.
- Video yang lebih panjang dari 10 detik otomatis dibagi menjadi beberapa MediaSegment.

Contoh video berdurasi 27 detik:

- Segment 1: detik 0 sampai 10.
- Segment 2: detik 10 sampai 20.
- Segment 3: detik 20 sampai 27.

MediaSegment menyimpan informasi minimal:

- Parent MediaAsset.
- Urutan segment.
- Waktu mulai.
- Waktu selesai.
- Path media sumber atau hasil segment.
- Status processing.
- Metadata ekstraksi frame.

### 3.4 Detection

Satu Detection merepresentasikan satu objek hasil deteksi setelah proses deduplication.

Satu MediaSegment dapat memiliki banyak Detection.

Detection minimal menyimpan:

- ID Detection.
- Referensi MediaAsset.
- Referensi MediaSegment.
- Referensi kelas.
- Snapshot atau referensi versi kelas yang digunakan.
- Nama kelas saat detection dibuat.
- Bounding box.
- Kondisi.
- Tingkat kelayakan.
- Timestamp atau frame index jika sumber berasal dari video.
- Lokasi detection jika tersedia.
- Referensi konfigurasi model.
- Referensi prompt atau prompt version.
- Metadata processing.
- Status conflict jika ada.

Bounding box menggunakan normalized coordinate agar tidak bergantung pada resolusi media.

Format internal:

```json
{
  "x": 0.12,
  "y": 0.34,
  "width": 0.25,
  "height": 0.18
}
```

Nilai koordinat berada dalam rentang 0 sampai 1.

### 3.5 Raw AI Response

Raw response dari AI boleh disimpan untuk kebutuhan audit dan debugging.

Raw AI response bukan sumber utama data aplikasi.

Data utama untuk dashboard, pagination, review, approval, dan reporting harus menggunakan struktur Detection yang telah dinormalisasi.

### 3.6 Live Detection

Live detection memiliki dua jenis data:

1. Temporary detection.

Hasil hanya ditampilkan sebagai overlay dan tidak masuk ke data survei.

2. Saved capture.

Frame atau klip yang secara eksplisit disimpan surveyor menjadi MediaAsset dan masuk ke pipeline processing yang sama dengan media upload biasa.

### 3.7 Submission dan SubmissionVersion

Satu SurveySession dapat memiliki satu atau lebih SubmissionVersion.

Setiap SubmissionVersion adalah snapshot hasil survei pada saat submit atau re-submit.

Versi yang telah masuk ke proses review bersifat immutable.

Revisi setelah reject tidak boleh mengubah data pada SubmissionVersion sebelumnya.

Sistem membuat versi baru yang menjadi editable revision.

Pada satu waktu, hanya satu SubmissionVersion dari SurveySession yang dapat aktif dalam antrean review.

### 3.8 Class dan Model Versioning

Perubahan konfigurasi kelas tidak boleh mengubah interpretasi data historis.

Perubahan konfigurasi model juga tidak boleh mengubah informasi model yang digunakan pada Detection lama.

Setiap Detection harus dapat ditelusuri ke:

- ClassDefinitionVersion yang digunakan.
- ModelConfig yang digunakan.
- Model name.
- Prompt version atau prompt snapshot.
- Waktu processing.

## 4. Survey Session State Machine

SurveySession memiliki state machine eksplisit.

Status utama:

- `berlangsung`
- `selesai_menunggu_submit`
- `menunggu_review`
- `disetujui`
- `ditolak`
- `perlu_perbaikan`

### 4.1 Berlangsung

Status awal setelah sesi dibuat.

Aksi yang diizinkan:

- Upload media.
- Menyimpan capture dari live mode.
- Menjalankan live mode.
- Mengedit metadata.
- Menghapus media.
- Menghapus sesi.
- Melakukan retry processing.
- Menunggu processing media selesai.

Aksi yang tidak diizinkan:

- Submit ke admin.

### 4.2 Selesai Menunggu Submit

Surveyor telah menekan tombol `Akhiri Survei`.

Sistem mencatat waktu selesai.

Aksi yang tidak lagi diizinkan:

- Upload media baru.
- Menjalankan live mode.
- Menyimpan capture baru dari live mode.

Aksi yang tetap diizinkan:

- Melihat hasil.
- Mengedit metadata.
- Menghapus media.
- Melakukan retry processing jika masih diperlukan.
- Mereview konflik kelas.
- Submit setelah seluruh validasi terpenuhi.

### 4.3 Menunggu Review

Surveyor telah melakukan submit.

Data SubmissionVersion yang sedang direview bersifat immutable.

Aksi surveyor yang tidak diizinkan:

- Mengubah metadata versi yang sedang direview.
- Upload media.
- Menghapus media.
- Mengubah hasil detection.

Admin dapat:

- Melihat detail.
- Mengoreksi field yang secara eksplisit diizinkan.
- Approve.
- Reject.
- Memeriksa riwayat versi.

### 4.4 Disetujui

Admin menyetujui SubmissionVersion.

Data menjadi final.

Data muncul pada dashboard dan rekap hasil.

Tidak ada perubahan langsung terhadap versi yang telah disetujui.

### 4.5 Ditolak

Admin menolak SubmissionVersion.

Versi yang ditolak tetap immutable.

Surveyor dapat melihat:

- Alasan reject.
- Catatan admin.
- Data versi yang ditolak.

Surveyor belum langsung mengubah versi yang ditolak.

Surveyor harus memulai aksi `Buat Revisi`.

### 4.6 Perlu Perbaikan

Sistem membuat revision draft baru berdasarkan SubmissionVersion yang ditolak.

Revision draft dapat menggunakan data versi sebelumnya sebagai referensi.

Surveyor dapat melakukan tindakan yang diizinkan dalam proses revisi.

Setelah revisi selesai, surveyor mengakhiri revisi dan mengirim SubmissionVersion baru untuk review.

Versi lama tetap tersimpan.

### 4.7 Transition yang Diizinkan

`berlangsung` ke `selesai_menunggu_submit` melalui `Akhiri Survei`.

`selesai_menunggu_submit` ke `menunggu_review` melalui `Submit`.

`menunggu_review` ke `disetujui` melalui `Approve`.

`menunggu_review` ke `ditolak` melalui `Reject`.

`ditolak` ke `perlu_perbaikan` melalui `Buat Revisi`.

`perlu_perbaikan` ke `menunggu_review` melalui `Re-submit`.

Tidak ada transition lain yang diperbolehkan.

## 5. Media Processing State Machine

Status MediaAsset:

- `queued`
- `uploading`
- `uploaded`
- `processing`
- `completed`
- `failed`
- `deleted`

Transition normal:

`queued` ke `uploading`.

`uploading` ke `uploaded`.

`uploaded` ke `processing`.

`processing` ke `completed`.

Jika processing gagal:

`processing` ke `failed`.

Media yang gagal dapat kembali diproses melalui retry.

Retry tidak boleh menghasilkan Detection duplikat.

Media yang dihapus berubah menjadi `deleted`.

Media yang telah dihapus tidak boleh ikut masuk dalam perhitungan hasil sesi.

## 6. Deduplication dan Conflict Rules

### 6.1 Deduplication

Deduplication dilakukan dalam scope satu SurveySession.

Untuk video:

- Sistem membandingkan Detection pada frame yang berdekatan secara temporal.
- Sistem dapat menggunakan IoU bounding box.
- Sistem mempertimbangkan kedekatan waktu.
- Sistem dapat menggunakan tracking temporal.
- Objek yang sama pada frame berdekatan tidak boleh dihitung sebagai temuan baru.

Deduplication antar MediaSegment yang berasal dari video yang sama juga harus mempertimbangkan hubungan temporal.

Untuk gambar atau media yang tidak memiliki hubungan temporal:

- Sistem tidak boleh otomatis menghapus Detection hanya berdasarkan kemiripan visual.
- Deduplication lintas gambar memerlukan strategi tambahan yang dapat diimplementasikan secara terpisah.

### 6.2 Conflict Antar Kelas

Overlap bounding box tidak selalu berarti konflik.

Konflik hanya terjadi jika:

- Dua Detection berada pada media atau frame yang sama.
- Kedua Detection memiliki kelas berbeda.
- Nilai IoU memenuhi atau melebihi threshold yang ditentukan.
- Kedua kelas tersebut ditandai sebagai mutually exclusive dalam konfigurasi kelas.

Default IoU threshold untuk conflict adalah 0.5.

Threshold harus dapat dikonfigurasi.

Surveyor harus menyelesaikan conflict sebelum submit.

Admin tetap dapat mengoreksi hasil conflict pada tahap review.

## 7. AI Output Contract

Semua provider AI harus menghasilkan output yang dikonversi ke DetectionSchema internal.

Contoh:

```json
{
  "detections": [
    {
      "class_id": "uuid",
      "class_name": "jalan_berlubang",
      "bbox": {
        "x": 0.12,
        "y": 0.34,
        "width": 0.25,
        "height": 0.18
      },
      "condition": "aspal rusak dengan lubang terlihat",
      "feasibility": "tidak_layak"
    }
  ]
}
```

Aturan:

- Model hanya boleh mengembalikan kelas yang terdapat pada active class list.
- Jika model tidak menemukan objek, model harus mengembalikan array `detections` kosong.
- Backend provider layer bertanggung jawab mengubah response provider menjadi schema internal.
- Frontend dan business logic utama tidak boleh bergantung langsung pada format OpenRouter atau format provider on-premise.

## 8. User Stories

### US-001: Membuat sesi survei

**Description:** Sebagai surveyor, saya ingin membuat data sesi survei terlebih dahulu sebelum mulai mengupload media, supaya semua gambar, video, dan capture yang saya kumpulkan selama survei tergabung dalam satu sesi.

**Acceptance Criteria:**

- [ ] Surveyor mengisi nama survei.
- [ ] Surveyor menentukan lokasi survei di peta OpenStreetMap.
- [ ] Lokasi dapat berupa titik koordinat melalui pin manual, pencarian alamat, atau autofill GPS.
- [ ] Lokasi dapat berupa area atau polygon.
- [ ] Surveyor mengisi tanggal survei.
- [ ] Waktu mulai survei tercatat otomatis saat sesi dibuat.
- [ ] Sesi survei berstatus `berlangsung` setelah dibuat.
- [ ] Jika izin GPS ditolak atau GPS tidak tersedia, surveyor tetap dapat menggunakan pin manual atau pencarian alamat.
- [ ] Sesi survei memiliki state machine yang memvalidasi transition status.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-002: Upload gambar dan video dalam sesi survei

**Description:** Sebagai surveyor, saya ingin mengupload gambar atau video ke sesi survei yang sedang berlangsung supaya AI dapat mendeteksi objek dan kondisinya secara otomatis. Upload ini tidak mengakhiri atau mengirim sesi survei ke admin.

**Acceptance Criteria:**

- [ ] Surveyor dapat mengupload banyak file JPG, PNG, atau MP4 ke dalam satu sesi.
- [ ] Setiap file upload menjadi satu MediaAsset.
- [ ] Jika MediaAsset berupa gambar, sistem membuat satu MediaSegment untuk processing.
- [ ] Jika MediaAsset berupa video lebih dari 10 detik, sistem otomatis membaginya menjadi beberapa MediaSegment maksimal 10 detik.
- [ ] Proses upload dan AI berjalan asynchronous.
- [ ] Frontend tidak menunggu seluruh proses AI selesai untuk melanjutkan penggunaan aplikasi.
- [ ] Setiap MediaAsset memiliki status `queued`, `uploading`, `uploaded`, `processing`, `completed`, `failed`, atau `deleted`.
- [ ] Kegagalan satu MediaAsset tidak mengubah status SurveySession.
- [ ] Surveyor dapat melakukan retry pada media yang gagal diproses.
- [ ] Retry tidak boleh menghasilkan Detection duplikat.
- [ ] Sistem menampilkan status processing untuk setiap media.
- [ ] Hasil AI dikonversi ke schema Detection internal.
- [ ] Setiap Detection menyimpan kelas, bounding box, kondisi, tingkat kelayakan, referensi media, dan metadata model.
- [ ] Hasil Detection dari seluruh media dalam sesi digabung secara akumulatif dan dikelompokkan per kelas.
- [ ] Sistem melakukan deduplication untuk objek yang sama pada frame video berdekatan.
- [ ] Sistem tidak membuat submission terpisah untuk setiap batch.
- [ ] Hasil ditampilkan per kelas dengan pagination.
- [ ] Setiap media yang dihapus tidak lagi dihitung dalam ringkasan sesi.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003: Deteksi live video dengan AI overlay

**Description:** Sebagai surveyor, saya ingin menyalakan kamera di dalam sesi survei yang sedang berlangsung dan melihat AI menghighlight objek dari kelas yang telah ditentukan admin secara near-realtime.

**Acceptance Criteria:**

- [ ] Surveyor dapat mengaktifkan kamera device melalui browser selama sesi berstatus `berlangsung`.
- [ ] Sistem mengambil sampel frame secara berkala.
- [ ] Interval sampling dapat dikonfigurasi.
- [ ] Sistem tidak mengirim setiap frame mentah ke model.
- [ ] Bounding box dan label kelas ditampilkan sebagai overlay di atas video.
- [ ] Overlay bersifat near-realtime.
- [ ] UI menjelaskan bahwa mode ini bukan realtime frame-by-frame penuh.
- [ ] Detection dari live mode bersifat temporary secara default.
- [ ] Temporary detection tidak otomatis masuk ke data survei.
- [ ] Surveyor dapat secara eksplisit menyimpan frame atau klip.
- [ ] Frame atau klip yang disimpan menjadi MediaAsset.
- [ ] MediaAsset dari live capture masuk ke pipeline processing yang sama dengan upload biasa.
- [ ] Klip lebih dari 10 detik otomatis dibagi menjadi MediaSegment maksimal 10 detik.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Mengakhiri sesi survei

**Description:** Sebagai surveyor, saya ingin menekan tombol terpisah untuk mengakhiri sesi survei setelah semua media selesai dikumpulkan.

**Acceptance Criteria:**

- [ ] Ada tombol `Akhiri Survei` yang terpisah dari tombol upload dan submit.
- [ ] Tombol hanya muncul saat sesi berstatus `berlangsung`.
- [ ] Sistem mencatat waktu selesai saat surveyor mengakhiri sesi.
- [ ] Status berubah menjadi `selesai_menunggu_submit`.
- [ ] Setelah sesi diakhiri, surveyor tidak dapat upload media baru.
- [ ] Setelah sesi diakhiri, surveyor tidak dapat menyalakan live mode.
- [ ] Sistem menampilkan konfirmasi sebelum sesi diakhiri.
- [ ] Jika masih ada MediaAsset berstatus `uploading` atau `processing`, sistem harus memberi tahu surveyor.
- [ ] Surveyor tidak dapat submit selama masih ada media berstatus `uploading` atau `processing`.
- [ ] Media dengan status `failed` dapat diproses ulang atau dihapus sebelum submit.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Mengedit dan menghapus data survei sebelum submit

**Description:** Sebagai surveyor, saya ingin dapat mengedit metadata sesi atau menghapus media yang tidak sesuai sebelum mengirim hasil ke admin.

**Acceptance Criteria:**

- [ ] Selama sesi berstatus `berlangsung`, surveyor dapat mengedit nama survei, lokasi, dan tanggal.
- [ ] Selama sesi berstatus `selesai_menunggu_submit`, surveyor dapat mengedit nama survei, lokasi, dan tanggal.
- [ ] Surveyor dapat menghapus MediaAsset beserta seluruh MediaSegment dan Detection yang berasal dari media tersebut.
- [ ] Penghapusan media memperbarui jumlah temuan per kelas secara otomatis.
- [ ] Surveyor dapat menghapus seluruh SurveySession selama belum pernah disubmit.
- [ ] Sistem menampilkan konfirmasi sebelum penghapusan.
- [ ] Penghapusan bersifat permanen untuk MVP.
- [ ] Setelah sesi masuk `menunggu_review`, data versi yang sedang direview tidak dapat diedit surveyor.
- [ ] Setelah sesi `disetujui`, data final tidak dapat diedit langsung.
- [ ] Setelah sesi `ditolak`, surveyor harus membuat revisi baru dan tidak boleh mengubah versi yang ditolak.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Submit sesi survei untuk direview

**Description:** Sebagai surveyor, saya ingin mereview ringkasan sesi yang sudah diakhiri lalu menekan submit untuk mengirim hasil ke admin.

**Acceptance Criteria:**

- [ ] Surveyor dapat melihat ringkasan sesi yang berstatus `selesai_menunggu_submit`.
- [ ] Ringkasan dikelompokkan per kelas.
- [ ] Ringkasan menampilkan jumlah Detection.
- [ ] Ringkasan menampilkan kondisi.
- [ ] Ringkasan menampilkan tingkat kelayakan.
- [ ] Ringkasan menampilkan lokasi sesi.
- [ ] Submit hanya aktif jika seluruh conflict class telah diselesaikan.
- [ ] Submit hanya aktif jika tidak ada MediaAsset berstatus `uploading` atau `processing`.
- [ ] Media berstatus `failed` harus dihapus atau berhasil diproses ulang sebelum submit.
- [ ] Saat submit, sistem membuat SubmissionVersion immutable.
- [ ] Status sesi berubah menjadi `menunggu_review`.
- [ ] Surveyor dapat melihat riwayat sesi beserta statusnya.
- [ ] Surveyor dapat melihat riwayat SubmissionVersion.
- [ ] Setiap versi menampilkan status, waktu submit, dan hasil review.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-007: Revisi dan re-submit sesi yang ditolak

**Description:** Sebagai surveyor, saya ingin memperbaiki hasil survei yang ditolak tanpa mengubah riwayat versi sebelumnya.

**Acceptance Criteria:**

- [ ] Jika admin menolak hasil, status sesi berubah menjadi `ditolak`.
- [ ] Surveyor dapat melihat alasan reject.
- [ ] Surveyor dapat melihat catatan bebas dari admin jika tersedia.
- [ ] Surveyor dapat menekan aksi `Buat Revisi`.
- [ ] Sistem membuat revision draft baru.
- [ ] Status sesi berubah menjadi `perlu_perbaikan`.
- [ ] Versi yang sebelumnya ditolak tetap immutable.
- [ ] Data lokasi dan kelas dari versi sebelumnya dapat digunakan sebagai referensi.
- [ ] Surveyor dapat menghapus media dan menambahkan media baru sesuai aturan revisi.
- [ ] Surveyor dapat melakukan retry processing pada media yang gagal.
- [ ] Surveyor tidak dapat mengubah raw data pada SubmissionVersion sebelumnya.
- [ ] Setelah revisi selesai dan dikirim, sistem membuat SubmissionVersion baru.
- [ ] Versi sebelumnya tetap dapat dilihat oleh surveyor dan admin.
- [ ] Pada satu waktu hanya satu versi yang dapat masuk ke antrean review.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Review dan approval hasil survei

**Description:** Sebagai admin, saya ingin mereview hasil sesi survei dan menyetujui atau menolaknya sebelum menjadi data final.

**Acceptance Criteria:**

- [ ] Admin melihat daftar sesi berstatus `menunggu_review`.
- [ ] Admin dapat membedakan submission awal dan re-submit.
- [ ] Admin dapat membuka detail SubmissionVersion.
- [ ] Hasil ditampilkan per kelas dengan pagination.
- [ ] Admin dapat melihat media, bounding box, kondisi, tingkat kelayakan, dan lokasi.
- [ ] Admin dapat melihat conflict kelas yang sebelumnya diselesaikan surveyor.
- [ ] Admin dapat mengoreksi class pada conflict jika diperlukan.
- [ ] Hak edit admin terhadap field Detection harus didefinisikan secara eksplisit oleh sistem.
- [ ] Perubahan yang dilakukan admin harus dicatat dalam audit trail.
- [ ] Admin dapat approve.
- [ ] Admin dapat reject.
- [ ] Saat reject, admin wajib memilih alasan dari daftar pilihan.
- [ ] Admin dapat menambahkan catatan bebas.
- [ ] Admin dapat melihat riwayat SubmissionVersion.
- [ ] Setelah approve, data menjadi final dan masuk dashboard.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Dashboard rekap hasil survei

**Description:** Sebagai admin, saya ingin melihat rekap keseluruhan hasil survei yang sudah disetujui.

**Acceptance Criteria:**

- [ ] Dashboard hanya menggunakan data SubmissionVersion yang telah disetujui.
- [ ] Dashboard menampilkan total sesi survei.
- [ ] Dashboard menampilkan jumlah temuan per tingkat kelayakan.
- [ ] Dashboard menampilkan jumlah temuan per kelas.
- [ ] Dashboard menampilkan sebaran lokasi di peta.
- [ ] Admin dapat filter berdasarkan rentang tanggal.
- [ ] Admin dapat filter berdasarkan satu atau lebih kelas.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-010: Hasil survei per kelas

**Description:** Sebagai admin, saya ingin melihat hasil survei yang dikelompokkan berdasarkan kelas objek.

**Acceptance Criteria:**

- [ ] Admin dapat memilih satu atau lebih kelas.
- [ ] Hasil menampilkan jumlah Detection per tingkat kelayakan.
- [ ] Hasil mencakup data lintas sesi yang telah disetujui.
- [ ] Hasil dapat dilihat dalam bentuk list.
- [ ] Hasil dapat dilihat dalam bentuk titik atau area di peta.
- [ ] Jika Detection tidak memiliki koordinat individual, sistem menggunakan lokasi SurveySession sebagai fallback.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-011: Manajemen user

**Description:** Sebagai admin, saya ingin mengelola akun surveyor dan admin lain supaya akses sistem terkontrol.

**Acceptance Criteria:**

- [ ] Admin dapat menambah user.
- [ ] Admin dapat mengedit user.
- [ ] Admin dapat menonaktifkan user.
- [ ] Admin dapat menetapkan role `surveyor` atau `admin`.
- [ ] Autentikasi menggunakan Supabase Auth.
- [ ] User nonaktif tidak dapat membuat sesi baru atau mengakses data yang tidak berhak diakses.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-012: Manajemen kelas custom

**Description:** Sebagai admin, saya ingin mengelola kelas objek deteksi tanpa melakukan retraining model.

**Acceptance Criteria:**

- [ ] Admin dapat membuat kelas baru.
- [ ] Setiap kelas memiliki nama.
- [ ] Setiap kelas memiliki deskripsi visual.
- [ ] Setiap kelas memiliki kriteria tingkat kelayakan.
- [ ] Tingkat kelayakan minimal terdiri dari `layak`, `cukup_layak`, dan `tidak_layak`.
- [ ] Kriteria berupa deskripsi kualitatif.
- [ ] Admin dapat menentukan kelas yang saling eksklusif.
- [ ] Admin dapat menentukan apakah overlap dengan kelas tertentu harus dianggap conflict.
- [ ] Deskripsi kelas menjadi bagian dari prompt AI.
- [ ] Model menentukan tingkat kelayakan berdasarkan kriteria kualitatif.
- [ ] Sistem tidak menggunakan confidence threshold numerik sebagai penentu utama tingkat kelayakan.
- [ ] Admin dapat mengedit kelas.
- [ ] Admin dapat menonaktifkan kelas.
- [ ] Kelas yang telah digunakan data historis tidak boleh dihapus secara hard delete.
- [ ] Sistem menggunakan versioning atau snapshot agar perubahan kelas tidak mengubah data historis.
- [ ] Admin dapat melakukan preview atau test detection sebelum kelas digunakan surveyor.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-013: Manajemen model AI

**Description:** Sebagai admin, saya ingin mengatur model AI yang digunakan untuk detection.

**Acceptance Criteria:**

- [ ] Model default awal adalah Qwen3 VL 8B Instruct.
- [ ] Admin dapat menambah konfigurasi model.
- [ ] Admin dapat memilih provider `OpenRouter` atau `onpremise`.
- [ ] Konfigurasi memiliki model name.
- [ ] Konfigurasi memiliki endpoint URL jika diperlukan.
- [ ] Secret seperti API key disimpan terenkripsi.
- [ ] Secret tidak pernah dikembalikan penuh oleh API setelah disimpan.
- [ ] UI hanya menampilkan status konfigurasi dan informasi yang telah dimasking.
- [ ] Admin dapat mengaktifkan satu model sebagai default.
- [ ] Sistem dapat menyimpan konfigurasi provider lain yang kompatibel dengan image input dan structured output.
- [ ] Semua provider harus menghasilkan DetectionSchema internal yang sama.
- [ ] Admin dapat melakukan test koneksi.
- [ ] ModelConfig yang sudah digunakan pada data historis tidak boleh dihapus secara hard delete.
- [ ] Sistem dapat menggunakan soft delete atau status inactive.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## 9. Functional Requirements

- FR-1: Sistem harus mengizinkan surveyor membuat SurveySession dengan nama, lokasi, tanggal, waktu mulai, surveyor pemilik, dan status awal `berlangsung`.
- FR-2: Lokasi SurveySession dapat berupa titik koordinat atau area/polygon.
- FR-3: Sistem harus mendukung pin manual, pencarian alamat, dan geolocation browser.
- FR-4: Jika GPS tidak tersedia atau permission ditolak, surveyor harus tetap dapat menentukan lokasi secara manual.
- FR-5: Satu SurveySession harus dapat memiliki banyak MediaAsset.
- FR-6: Satu MediaAsset harus merepresentasikan satu file asli yang diupload atau disimpan dari live capture.
- FR-7: Gambar memiliki satu MediaSegment untuk processing.
- FR-8: Video lebih dari 10 detik harus otomatis dibagi menjadi beberapa MediaSegment dengan durasi maksimal 10 detik.
- FR-9: Proses AI harus berjalan asynchronous dan tidak memblokir frontend sampai processing selesai.
- FR-10: MediaAsset harus memiliki lifecycle `queued`, `uploading`, `uploaded`, `processing`, `completed`, `failed`, dan `deleted`.
- FR-11: Kegagalan satu MediaAsset tidak boleh otomatis mengubah status SurveySession.
- FR-12: Sistem harus mendukung retry processing yang idempotent.
- FR-13: Retry tidak boleh membuat Detection duplikat.
- FR-14: Satu MediaSegment dapat menghasilkan banyak Detection.
- FR-15: Satu Detection harus merepresentasikan satu objek unik setelah deduplication.
- FR-16: Detection harus menyimpan class, bbox, kondisi, tingkat kelayakan, referensi media, referensi model, dan metadata processing.
- FR-17: Bounding box harus menggunakan normalized coordinate dalam rentang 0 sampai 1.
- FR-18: Sistem boleh menyimpan raw AI response untuk audit dan debugging.
- FR-19: Raw AI response tidak boleh menjadi sumber utama data aplikasi.
- FR-20: Semua provider AI harus dikonversi ke DetectionSchema internal yang sama.
- FR-21: Model hanya boleh mengembalikan kelas yang terdapat pada active class list.
- FR-22: Sistem harus melakukan deduplication Detection pada frame video yang berdekatan.
- FR-23: Deduplication harus mempertimbangkan IoU, kedekatan waktu, dan hubungan temporal.
- FR-24: Sistem tidak boleh menghapus Detection lintas gambar hanya berdasarkan kemiripan visual tanpa aturan tambahan.
- FR-25: Sistem harus mendeteksi conflict antar kelas berdasarkan IoU dan aturan mutually exclusive.
- FR-26: Default IoU threshold untuk conflict adalah 0.5 dan harus dapat dikonfigurasi.
- FR-27: Surveyor harus menyelesaikan conflict sebelum submit.
- FR-28: Live detection harus menggunakan frame sampling berkala dan bersifat near-realtime.
- FR-29: Live detection tidak boleh otomatis menjadi data SurveySession.
- FR-30: Frame atau klip dari live mode hanya menjadi data survei jika secara eksplisit disimpan surveyor.
- FR-31: Saved capture dari live mode harus menjadi MediaAsset.
- FR-32: Sistem harus menyediakan aksi `Akhiri Survei` yang terpisah dari upload dan submit.
- FR-33: `Akhiri Survei` harus mencatat waktu selesai dan mengubah status menjadi `selesai_menunggu_submit`.
- FR-34: Setelah sesi diakhiri, sistem harus memblokir upload baru dan live capture baru.
- FR-35: Surveyor tetap dapat mengedit metadata dan menghapus media selama status `berlangsung` atau `selesai_menunggu_submit`.
- FR-36: Penghapusan MediaAsset harus menghapus seluruh MediaSegment dan Detection yang bergantung pada media tersebut.
- FR-37: Rekap hasil harus diperbarui otomatis setelah media dihapus.
- FR-38: Submit hanya dapat dilakukan dari status `selesai_menunggu_submit`.
- FR-39: Submit tidak boleh dilakukan jika terdapat media berstatus `uploading` atau `processing`.
- FR-40: Media berstatus `failed` harus dihapus atau berhasil diproses ulang sebelum submit.
- FR-41: Submit harus membuat SubmissionVersion immutable.
- FR-42: Setelah submit, status SurveySession berubah menjadi `menunggu_review`.
- FR-43: Status SurveySession harus mengikuti state machine eksplisit.
- FR-44: Status `berlangsung` hanya dapat berubah menjadi `selesai_menunggu_submit`.
- FR-45: Status `selesai_menunggu_submit` hanya dapat berubah menjadi `menunggu_review`.
- FR-46: Status `menunggu_review` hanya dapat berubah menjadi `disetujui` atau `ditolak`.
- FR-47: Status `ditolak` dapat berubah menjadi `perlu_perbaikan` melalui aksi `Buat Revisi`.
- FR-48: Status `perlu_perbaikan` dapat menghasilkan SubmissionVersion baru melalui re-submit.
- FR-49: Versi yang sudah direview harus bersifat immutable.
- FR-50: Revisi tidak boleh mengubah SubmissionVersion sebelumnya.
- FR-51: Sistem harus menyimpan riwayat semua SubmissionVersion.
- FR-52: Pada satu waktu hanya satu SubmissionVersion dari satu SurveySession yang boleh aktif dalam antrean review.
- FR-53: Admin harus dapat melihat detail sesi dan riwayat versi.
- FR-54: Admin harus dapat mengoreksi data Detection sesuai hak edit yang didefinisikan sistem.
- FR-55: Perubahan admin harus dicatat dalam audit trail.
- FR-56: Saat reject, admin harus memilih alasan dari daftar pilihan.
- FR-57: Admin dapat menambahkan catatan bebas.
- FR-58: Setelah approve, data menjadi final dan tersedia pada dashboard.
- FR-59: Dashboard hanya menggunakan data yang telah disetujui.
- FR-60: Sistem harus mendukung filter tanggal dan kelas.
- FR-61: Admin harus dapat mengelola user dan role.
- FR-62: Sistem harus menggunakan Supabase Auth untuk autentikasi.
- FR-63: Admin harus dapat mengelola kelas deteksi.
- FR-64: Perubahan kelas harus menggunakan versioning atau snapshot agar data historis tetap konsisten.
- FR-65: Admin harus dapat mengonfigurasi mutually exclusive class.
- FR-66: Admin harus dapat mengelola konfigurasi model.
- FR-67: API key dan credential harus disimpan terenkripsi.
- FR-68: Secret tidak boleh diekspos kembali ke frontend.
- FR-69: ModelConfig yang telah digunakan pada data historis tidak boleh dihapus secara hard delete.
- FR-70: Setiap Detection harus menyimpan referensi ClassDefinitionVersion.
- FR-71: Setiap Detection harus menyimpan referensi ModelConfig dan informasi model yang digunakan.
- FR-72: Sistem harus menggunakan Supabase untuk database dan autentikasi.
- FR-73: Sistem harus menggunakan Supabase Storage melalui S3-compatible API untuk media.
- FR-74: Upload media harus langsung menuju Supabase Storage dan tidak menggunakan server Next.js atau Python sebagai temporary storage.
- FR-75: Processing job harus asynchronous.
- FR-76: Sistem harus memiliki mekanisme idempotency untuk processing job.
- FR-77: Perubahan database harus dikelola melalui Prisma Migrate.
- FR-78: Prisma schema harus menjadi source of truth untuk struktur database.
- FR-79: Next.js harus menangani frontend, auth integration, business workflow, admin CRUD, SurveySession lifecycle, Submission lifecycle, dan dashboard.
- FR-80: FastAPI harus menangani video splitting, frame extraction, AI inference, dan live frame sampling.
- FR-81: FastAPI tidak boleh dapat diakses langsung dari public browser.
- FR-82: Komunikasi service-to-service harus menggunakan internal authentication.
- FR-83: FastAPI dapat menulis data processing dan Detection sesuai kontrak data yang ditentukan.
- FR-84: Transition SurveySession dan Submission harus divalidasi oleh state machine di backend.
- FR-85: Backend harus memiliki abstraction layer untuk provider AI.
- FR-86: OpenRouter dan on-premise provider harus menggunakan interface internal yang sama.
- FR-87: Basemap menggunakan OpenStreetMap.
- FR-88: Pencarian alamat menggunakan Nominatim atau provider geocoding kompatibel.
- FR-89: Frame hasil ekstraksi yang hanya bersifat temporary harus dapat dihapus setelah processing selesai jika tidak diperlukan UI atau audit.
- FR-90: Sistem harus menyimpan media asli dan preview yang diperlukan untuk menampilkan hasil Detection.
- FR-91: Limit ukuran file harus dapat dikonfigurasi melalui environment configuration.
- FR-92: Format dan limit media yang didukung harus divalidasi sebelum upload diproses.

## 10. Non-Goals (Out of Scope)

- Tidak membuat aplikasi mobile native Android atau iOS. Sistem berupa web responsif yang dapat digunakan melalui browser HP.
- Tidak menyediakan mode offline penuh.
- Upload, processing, dan submit memerlukan koneksi internet.
- Tidak melakukan training atau fine-tuning model AI.
- Kustomisasi kelas dilakukan melalui konfigurasi dan prompt engineering.
- Tidak ada live tracking atau continuous GPS tracking surveyor.
- Lokasi SurveySession dapat dipilih saat pembuatan dan diperbarui manual sebelum submit.
- Tidak ada notifikasi otomatis melalui email atau push pada versi awal.
- Tidak ada generate laporan PDF otomatis pada versi awal.
- Tidak ada undo atau trash bin pada MVP.
- Penghapusan yang telah dikonfirmasi bersifat permanen.
- Surveyor tidak dapat mengedit bounding box Detection secara manual pada MVP.
- Surveyor tidak dapat mengubah raw output AI secara langsung pada SubmissionVersion yang telah dibuat.
- Deduplication lintas gambar yang tidak memiliki hubungan temporal tidak menjadi fitur utama MVP tanpa strategi identifikasi objek tambahan.
- Realtime detection frame-by-frame penuh tidak menjadi target MVP.
- Live mode menggunakan near-realtime sampling.
- Full audit system di luar perubahan SubmissionVersion dan perubahan review tidak menjadi fokus utama MVP.

## 11. Design Considerations

- Tampilan surveyor harus dioptimalkan untuk penggunaan lapangan.
- Tombol utama harus mudah dijangkau dan berukuran cukup besar.
- Alur `Mulai Sesi`, `Upload Media`, `Live Detection`, `Akhiri Survei`, dan `Submit` harus dipisahkan secara visual.
- Status SurveySession harus selalu terlihat.
- Status setiap MediaAsset harus terlihat terpisah dari status SurveySession.
- Surveyor harus dapat membedakan media yang sedang upload, processing, selesai, dan gagal.
- Tombol `Akhiri Survei` dan `Submit` tidak boleh terlihat sebagai aksi yang sama.
- Aksi delete harus menggunakan konfirmasi.
- Penghapusan media dan sesi harus menjelaskan bahwa data akan dihapus permanen.
- Tampilan admin mengutamakan tabel, filter, detail media, dan peta.
- Hasil per kelas dapat menggunakan tab atau accordion.
- Pagination digunakan untuk jumlah Detection yang besar.
- Overlay live detection menggunakan canvas di atas elemen video.
- UI conflict harus menunjukkan dua atau lebih Detection yang bertentangan secara jelas.
- UI version history harus menunjukkan urutan SubmissionVersion, status, waktu, alasan reject, dan hasil review.
- UI secret configuration hanya menampilkan status configured dan nilai yang telah dimasking.
- UI harus menampilkan alasan mengapa submit tidak dapat dilakukan jika masih ada processing atau conflict yang belum selesai.

## 12. Technical Considerations

### 12.1 Next.js

Next.js bertanggung jawab untuk:

- Frontend surveyor.
- Frontend admin.
- API routes untuk business workflow.
- Integrasi Supabase Auth.
- SurveySession lifecycle.
- Submission lifecycle.
- State machine validation.
- Admin CRUD.
- User management.
- Class management.
- Model configuration management.
- Dashboard dan read API.

### 12.2 FastAPI

FastAPI bertanggung jawab untuk:

- Video splitting.
- Frame extraction.
- Frame sampling.
- AI inference.
- Provider abstraction.
- Konversi provider response menjadi DetectionSchema.
- Deduplication pipeline.
- Live sampling pipeline.
- Processing job execution.

FastAPI tidak boleh menjadi endpoint publik langsung untuk browser.

### 12.3 Database

Prisma schema menjadi source of truth struktur database.

Migrasi harus:

- Dibuat melalui Prisma Migrate.
- Disimpan dalam source control.
- Dijalankan berurutan pada development, staging, dan production.
- Tidak dibuat manual melalui Supabase dashboard jika perubahan tersebut memengaruhi schema.

Backend Python harus mengikuti schema dan kontrak data yang sama.

### 12.4 Storage

Supabase Storage digunakan untuk:

- File gambar asli.
- File video asli.
- Saved capture dari live mode.
- Preview hasil yang diperlukan.

Upload dilakukan langsung dari client ke Supabase Storage menggunakan S3-compatible API atau mekanisme upload resmi Supabase.

Server Next.js dan FastAPI tidak digunakan sebagai temporary storage untuk upload file besar.

Saat MediaAsset dihapus:

- Object Storage terkait harus ikut dihapus sesuai aturan lifecycle.
- MediaSegment dan Detection terkait harus ditandai atau dihapus sesuai kebutuhan versioning.

### 12.5 AI Provider Abstraction

Sistem harus memiliki interface internal untuk provider AI.

Contoh tanggung jawab:

```text
detect(input, activeClasses, promptConfig) -> DetectionSchema
```

Implementasi provider dapat berupa:

- OpenRouter provider.
- On-premise provider.
- Provider tambahan di masa depan.

Business logic utama tidak boleh bergantung pada format API provider tertentu.

### 12.6 Prompt Construction

Prompt AI terdiri dari:

- System instruction tetap.
- Output schema instruction.
- Daftar active classes.
- Deskripsi visual setiap kelas.
- Kriteria kondisi.
- Kriteria tingkat kelayakan.
- Aturan mutually exclusive class jika relevan.

AI hanya boleh memilih kelas dari active class list.

### 12.7 Processing Job

Setelah upload selesai:

1. Sistem membuat processing job.
2. Media berubah ke status `uploaded` atau `processing`.
3. Worker FastAPI memproses job.
4. Video dibagi menjadi MediaSegment jika diperlukan.
5. Frame diekstraksi atau diambil berdasarkan sampling.
6. Provider AI dipanggil.
7. Response dikonversi menjadi DetectionSchema.
8. Deduplication dijalankan.
9. Detection disimpan.
10. Media berubah menjadi `completed`.

Jika gagal:

1. Media berubah menjadi `failed`.
2. Error dicatat.
3. Surveyor dapat melakukan retry jika diizinkan.

Processing job harus menggunakan idempotency key.

### 12.8 Model dan Secret Security

API key dan credential:

- Dienkripsi sebelum disimpan.
- Tidak dikirim ke frontend.
- Tidak dikembalikan penuh setelah disimpan.
- Hanya dapat digunakan oleh backend service yang membutuhkan credential.
- Tidak boleh ditulis ke application log.

### 12.9 Location Model

SurveySession menyimpan lokasi utama.

Detection dapat memiliki koordinat individual jika tersedia.

Jika Detection tidak memiliki koordinat individual:

- Sistem menggunakan lokasi SurveySession sebagai fallback untuk tampilan peta.

## 13. Success Metrics

- Surveyor dapat menyelesaikan satu sesi dari pembuatan sampai submit tanpa input manual berlebihan.
- Sistem dapat menampilkan status processing setiap media dengan jelas.
- Tidak ada duplicate Detection akibat retry processing.
- Riwayat SubmissionVersion tetap utuh setelah re-submit.
- Data final tidak dapat berubah akibat perubahan class atau model configuration di masa depan.
- Admin dapat membedakan submission awal dan revisi.
- Dashboard hanya menampilkan data yang telah disetujui.
- Rasio conflict yang tidak terselesaikan sebelum submit harus 0.
- P95 waktu processing gambar ditargetkan berada dalam batas yang dapat diterima untuk penggunaan lapangan.
- P95 waktu processing video 10 detik ditargetkan berada dalam batas yang dapat diterima untuk penggunaan lapangan.
- Target angka latency spesifik harus ditentukan setelah benchmark model dan provider.
- Tingkat akurasi kelas dan kelayakan dievaluasi melalui rasio approval, reject, dan koreksi admin.
- Sistem mencatat seberapa sering admin mengubah class atau tingkat kelayakan untuk mengevaluasi kualitas AI.
- Minim kasus surveyor salah mengakhiri sesi sebelum semua media selesai dikumpulkan.
- Data yang masuk ke tahap review sudah bersih dan dapat diverifikasi melalui bukti visual.

## 14. Open Questions

- Daftar alasan reject di sisi admin berisi apa saja?
- Apakah daftar alasan reject bersifat fixed atau dapat dikelola admin?
- Field Detection apa saja yang boleh diedit admin pada tahap review?
- Apakah admin boleh mengubah kondisi?
- Apakah admin boleh mengubah tingkat kelayakan?
- Apakah admin boleh mengubah bounding box pada versi berikutnya?
- Apakah revision draft dapat kembali menambahkan media baru setelah SurveySession sebelumnya sudah ditolak?
- Apakah semua media dari versi lama otomatis direferensikan oleh revision draft atau surveyor memilih media yang dipakai kembali?
- Apakah SurveySession berstatus `berlangsung` dapat ditinggalkan dan dilanjutkan di hari lain?
- Apakah sistem perlu batas waktu maksimum satu sesi survei?
- Apakah `selesai_menunggu_submit` dapat dibuka kembali menjadi `berlangsung` jika surveyor lupa menambahkan media?
- Jika iya, apakah waktu selesai lama diganti atau disimpan sebagai riwayat?
- Apakah surveyor perlu memberikan alasan saat menghapus media?
- Berapa maksimal ukuran file gambar?
- Berapa maksimal ukuran file video?
- Berapa jumlah maksimum MediaAsset dalam satu SurveySession?
- Apakah format media selain JPG, PNG, dan MP4 akan didukung?
- Berapa interval default frame sampling pada live mode?
- Berapa threshold IoU default untuk deduplication video?
- Apakah threshold IoU conflict berbeda dengan threshold deduplication?
- Apakah Detection lintas media berbeda perlu dideduplicate pada masa depan?
- Berapa lama media asli harus disimpan?
- Berapa lama raw AI response harus disimpan?
- Apakah extracted frame yang digunakan sebagai bukti perlu disimpan permanen?
- Model on-premise apa yang akan digunakan pada deployment awal?
- Apakah endpoint on-premise memerlukan authentication tambahan selain endpoint URL?
- Apakah secret encryption menggunakan application-managed encryption key atau managed secret system?
- Apakah semua user admin memiliki hak yang sama untuk mengubah model configuration dan class configuration?
- Apakah perubahan class perlu approval sebelum aktif digunakan surveyor?
- Apakah perubahan model default boleh dilakukan ketika masih terdapat processing job yang sedang berjalan?