CREATE TABLE "MediaSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "maxVideoDurationSeconds" INTEGER NOT NULL DEFAULT 1200,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaSettings_maxVideoDurationSeconds_check"
      CHECK ("maxVideoDurationSeconds" BETWEEN 1 AND 1200)
);

INSERT INTO "MediaSettings" ("id", "maxVideoDurationSeconds", "updatedAt")
VALUES ('global', 1200, CURRENT_TIMESTAMP);
