-- AlterTable
ALTER TABLE "Project" ADD COLUMN "currentStage" TEXT;
ALTER TABLE "Project" ADD COLUMN "owners" TEXT;
ALTER TABLE "Project" ADD COLUMN "totalBudget" REAL;

-- CreateTable
CREATE TABLE "ProjectParticipant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "trade" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectParticipant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectParticipant_userId_idx" ON "ProjectParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectParticipant_projectId_trade_key" ON "ProjectParticipant"("projectId", "trade");
