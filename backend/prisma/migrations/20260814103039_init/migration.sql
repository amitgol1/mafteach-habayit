-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "trade" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Unit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "unitId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Phase_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubPhase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phaseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubPhase_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhaseAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "subPhaseId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhaseAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PhaseAssignment_subPhaseId_fkey" FOREIGN KEY ("subPhaseId") REFERENCES "SubPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Update" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subPhaseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "messageText" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Update_subPhaseId_fkey" FOREIGN KEY ("subPhaseId") REFERENCES "SubPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Update_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "phaseId" INTEGER,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "totalDue" REAL NOT NULL,
    "receiptMediaUrl" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialRecord_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Unit_projectId_idx" ON "Unit"("projectId");

-- CreateIndex
CREATE INDEX "Phase_unitId_idx" ON "Phase"("unitId");

-- CreateIndex
CREATE INDEX "SubPhase_phaseId_idx" ON "SubPhase"("phaseId");

-- CreateIndex
CREATE INDEX "PhaseAssignment_subPhaseId_idx" ON "PhaseAssignment"("subPhaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseAssignment_userId_subPhaseId_key" ON "PhaseAssignment"("userId", "subPhaseId");

-- CreateIndex
CREATE INDEX "Update_subPhaseId_idx" ON "Update"("subPhaseId");

-- CreateIndex
CREATE INDEX "FinancialRecord_projectId_idx" ON "FinancialRecord"("projectId");

-- CreateIndex
CREATE INDEX "FinancialRecord_phaseId_idx" ON "FinancialRecord"("phaseId");
