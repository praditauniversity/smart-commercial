ALTER TABLE "MediaSettings"
  ALTER COLUMN "maxVideoDurationSeconds" SET DEFAULT 120;

UPDATE "MediaSettings"
SET "maxVideoDurationSeconds" = 120
WHERE "id" = 'global' AND "maxVideoDurationSeconds" = 1200;
