-- CreateTable
CREATE TABLE "MediaPlayback" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "data" TEXT,
    "metrics" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaPlayback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaPlayback_mediaAssetId_key" ON "MediaPlayback"("mediaAssetId");

-- AddForeignKey
ALTER TABLE "MediaPlayback" ADD CONSTRAINT "MediaPlayback_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
