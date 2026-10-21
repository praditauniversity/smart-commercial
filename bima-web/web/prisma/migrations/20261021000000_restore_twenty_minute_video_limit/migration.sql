-- Restore the 20-minute limit supported by the application and admin settings page.
ALTER TABLE "MediaSettings"
  ALTER COLUMN "maxVideoDurationSeconds" SET DEFAULT 1200;

ALTER TABLE "MediaSettings"
  DROP CONSTRAINT IF EXISTS "MediaSettings_maxVideoDurationSeconds_check";

ALTER TABLE "MediaSettings"
  ADD CONSTRAINT "MediaSettings_maxVideoDurationSeconds_check"
  CHECK ("maxVideoDurationSeconds" BETWEEN 1 AND 1200);
