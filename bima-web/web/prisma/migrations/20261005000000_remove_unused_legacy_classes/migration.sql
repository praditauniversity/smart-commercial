-- Membersihkan kelas sisa alur VLM/SAM3 lama (tanpa padanan kelas keluaran model YOLO) yang tidak dipakai.
-- Hanya dijalankan bila model YOLO sudah terdaftar; kelas yang sudah punya temuan atau koreksi tidak disentuh.
DELETE FROM "ClassDefinition" c
WHERE c."modelClass" IS NULL
  AND EXISTS (SELECT 1 FROM "ModelConfig" m WHERE lower(m."provider") = 'yolo')
  AND NOT EXISTS (SELECT 1 FROM "Detection" d WHERE d."classId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM "OfficerCorrection" o WHERE o."classId" = c.id);
