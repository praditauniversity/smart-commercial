-- AlterTable
ALTER TABLE "ClassDefinition" ADD COLUMN     "category" TEXT,
ADD COLUMN     "categoryGroup" TEXT,
ADD COLUMN     "defaultSeverity" INTEGER,
ADD COLUMN     "modelClass" TEXT;

-- AlterTable
ALTER TABLE "Detection" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "exposure" INTEGER,
ADD COLUMN     "priorityBand" TEXT,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'belum_ditinjau',
ADD COLUMN     "riskScore" INTEGER,
ADD COLUMN     "severity" INTEGER,
ADD COLUMN     "severitySource" TEXT NOT NULL DEFAULT 'bawaan';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "evaluatedClipId" TEXT;

-- AlterTable
ALTER TABLE "SurveySession" ADD COLUMN     "zoneId" TEXT;

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL,
    "exposure" INTEGER NOT NULL,
    "description" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluatedClip" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "categories" TEXT NOT NULL DEFAULT '[]',
    "hasFinding" BOOLEAN NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "referenceCaption" TEXT NOT NULL,
    "validationStatus" TEXT,
    "modelCaption" TEXT NOT NULL,
    "bleu" DOUBLE PRECISION,
    "llmOverall" DOUBLE PRECISION,
    "completeness" DOUBLE PRECISION,
    "locationAccuracy" DOUBLE PRECISION,
    "severityAccuracy" DOUBLE PRECISION,
    "categoriesDetected" TEXT NOT NULL DEFAULT '[]',
    "categoriesMissed" TEXT NOT NULL DEFAULT '[]',
    "categoriesHallucinated" TEXT NOT NULL DEFAULT '[]',
    "judgeReason" TEXT,
    "generatorModel" TEXT,
    "generatorFrames" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluatedClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerCorrection" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detectionId" TEXT,
    "sessionId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "classId" TEXT,
    "severity" INTEGER,
    "bbox" TEXT,
    "timestampSeconds" DOUBLE PRECISION,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatedClip_clipId_key" ON "EvaluatedClip"("clipId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatedClip_fileName_key" ON "EvaluatedClip"("fileName");

-- CreateIndex
CREATE INDEX "OfficerCorrection_sessionId_idx" ON "OfficerCorrection"("sessionId");

-- CreateIndex
CREATE INDEX "OfficerCorrection_detectionId_idx" ON "OfficerCorrection"("detectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassDefinition_modelClass_key" ON "ClassDefinition"("modelClass");

-- AddForeignKey
ALTER TABLE "SurveySession" ADD CONSTRAINT "SurveySession_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_evaluatedClipId_fkey" FOREIGN KEY ("evaluatedClipId") REFERENCES "EvaluatedClip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorrection" ADD CONSTRAINT "OfficerCorrection_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "Detection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorrection" ADD CONSTRAINT "OfficerCorrection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SurveySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorrection" ADD CONSTRAINT "OfficerCorrection_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorrection" ADD CONSTRAINT "OfficerCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

