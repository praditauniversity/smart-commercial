-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "clipMatchNote" TEXT,
ADD COLUMN     "processingMetrics" TEXT;

-- CreateTable
CREATE TABLE "MediaFrame" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "timestampSeconds" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFrame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaFrame_mediaAssetId_frameIndex_key" ON "MediaFrame"("mediaAssetId", "frameIndex");

-- AddForeignKey
ALTER TABLE "MediaFrame" ADD CONSTRAINT "MediaFrame_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

