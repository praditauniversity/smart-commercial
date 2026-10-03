-- Rapikan label demo: hapus sufiks "(data contoh)" pada zona dan keterangan kondisi pada nama kelas rambu.
-- Hanya mengubah baris yang masih memakai teks bawaan seed; nama yang sudah diubah admin tidak disentuh.
UPDATE "Zone" SET "name" = REPLACE("name", ' (data contoh)', '') WHERE "name" LIKE '% (data contoh)';
UPDATE "Zone" SET "description" = REPLACE("description", ' Nilai Exposure adalah data contoh.', '') WHERE "description" LIKE '% Nilai Exposure adalah data contoh.';
UPDATE "ClassDefinition" SET "displayName" = 'Rambu' WHERE "name" = 'sign' AND "displayName" = 'Rambu (kondisi belum diklasifikasi)';
