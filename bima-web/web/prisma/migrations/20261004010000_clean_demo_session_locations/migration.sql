-- Hapus keterangan "(data simulasi)" pada alamat sesi demo bawaan. Alamat lain tidak diubah.
UPDATE "SurveySession" SET "locationAddress" = 'Lokasi demo' WHERE "locationAddress" = 'Lokasi contoh (data simulasi)';
UPDATE "SurveySession" SET "locationAddress" = REPLACE("locationAddress", ' contoh (data simulasi)', '') WHERE "locationAddress" LIKE '% contoh (data simulasi)';
