-- AlterTable
ALTER TABLE "ClassDefinition" ADD COLUMN     "hasConditionStage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Detection" ADD COLUMN     "conditionLabel" TEXT,
ADD COLUMN     "conditionModel" TEXT,
ADD COLUMN     "conditionTagId" TEXT;

-- AlterTable
ALTER TABLE "OfficerCorrection" ADD COLUMN     "conditionLabel" TEXT,
ADD COLUMN     "conditionTagId" TEXT;

-- CreateTable
CREATE TABLE "ConditionTag" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConditionTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConditionTag_classId_code_key" ON "ConditionTag"("classId", "code");

-- AddForeignKey
ALTER TABLE "Detection" ADD CONSTRAINT "Detection_conditionTagId_fkey" FOREIGN KEY ("conditionTagId") REFERENCES "ConditionTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionTag" ADD CONSTRAINT "ConditionTag_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

