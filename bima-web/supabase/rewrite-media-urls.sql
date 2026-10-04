BEGIN;

UPDATE "MediaAsset"
SET "fileUrl" = replace("fileUrl", :'source_base', :'target_base')
WHERE "fileUrl" LIKE :'source_base' || '%';

UPDATE "MediaSegment"
SET "mediaUrl" = replace("mediaUrl", :'source_base', :'target_base')
WHERE "mediaUrl" LIKE :'source_base' || '%';

-- Submission snapshots are intentionally immutable application records. Only their Storage
-- origin changes here; object paths and captured survey/review data remain byte-for-byte intact.
UPDATE "SubmissionVersion"
SET "snapshotData" = replace("snapshotData", :'source_base', :'target_base')
WHERE "snapshotData" LIKE '%' || :'source_base' || '%';

COMMIT;
