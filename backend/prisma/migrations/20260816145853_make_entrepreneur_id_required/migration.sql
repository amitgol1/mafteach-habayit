/*
  Warnings:

  - Made the column `entrepreneurId` on table `Project` required. This step will fail if there are existing NULL values in that column.

*/
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
    "entrepreneurId" INTEGER NOT NULL,
    CONSTRAINT "Project_entrepreneurId_fkey" FOREIGN KEY ("entrepreneurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "currentStage", "entrepreneurId", "id", "location", "name", "overallStatus", "owners", "totalBudget") SELECT "createdAt", "currentStage", "entrepreneurId", "id", "location", "name", "overallStatus", "owners", "totalBudget" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_entrepreneurId_idx" ON "Project"("entrepreneurId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
