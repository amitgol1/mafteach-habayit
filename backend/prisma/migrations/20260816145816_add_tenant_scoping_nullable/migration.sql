-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "owners" TEXT,
    "totalBudget" REAL,
    "currentStage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entrepreneurId" INTEGER,
    CONSTRAINT "Project_entrepreneurId_fkey" FOREIGN KEY ("entrepreneurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "currentStage", "id", "location", "name", "overallStatus", "owners", "totalBudget") SELECT "createdAt", "currentStage", "id", "location", "name", "overallStatus", "owners", "totalBudget" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_entrepreneurId_idx" ON "Project"("entrepreneurId");
CREATE TABLE "new_Update" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subPhaseId" INTEGER,
    "projectId" INTEGER,
    "userId" INTEGER NOT NULL,
    "messageText" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Update_subPhaseId_fkey" FOREIGN KEY ("subPhaseId") REFERENCES "SubPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Update_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Update_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Update" ("id", "mediaType", "mediaUrl", "messageText", "subPhaseId", "timestamp", "userId") SELECT "id", "mediaType", "mediaUrl", "messageText", "subPhaseId", "timestamp", "userId" FROM "Update";
DROP TABLE "Update";
ALTER TABLE "new_Update" RENAME TO "Update";
CREATE INDEX "Update_subPhaseId_idx" ON "Update"("subPhaseId");
CREATE INDEX "Update_projectId_idx" ON "Update"("projectId");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "trade" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role", "trade") SELECT "createdAt", "email", "id", "name", "passwordHash", "role", "trade" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_createdById_idx" ON "User"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
