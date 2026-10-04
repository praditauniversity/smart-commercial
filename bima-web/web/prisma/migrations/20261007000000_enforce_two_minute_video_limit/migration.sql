-- Keep the Prisma default, stored setting, and database constraint at two minutes.
ALTER TABLE "MediaSettings"
  ALTER COLUMN "maxVideoDurationSeconds" SET DEFAULT 120;

UPDATE "MediaSettings"
SET "maxVideoDurationSeconds" = 120, "updatedAt" = CURRENT_TIMESTAMP
WHERE "maxVideoDurationSeconds" > 120;

INSERT INTO "MediaSettings" ("id", "maxVideoDurationSeconds", "updatedAt")
VALUES ('global', 120, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET "maxVideoDurationSeconds" = 120, "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "MediaSettings"
  DROP CONSTRAINT IF EXISTS "MediaSettings_maxVideoDurationSeconds_check";

ALTER TABLE "MediaSettings"
  ADD CONSTRAINT "MediaSettings_maxVideoDurationSeconds_check"
  CHECK ("maxVideoDurationSeconds" BETWEEN 1 AND 120);
