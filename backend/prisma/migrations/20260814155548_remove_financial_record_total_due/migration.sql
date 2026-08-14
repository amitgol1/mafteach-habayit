/*
  Warnings:

  - You are about to drop the column `totalDue` on the `FinancialRecord` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FinancialRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "phaseId" INTEGER,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "receiptMediaUrl" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialRecord_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinancialRecord" ("amountPaid", "id", "phaseId", "projectId", "receiptMediaUrl", "timestamp") SELECT "amountPaid", "id", "phaseId", "projectId", "receiptMediaUrl", "timestamp" FROM "FinancialRecord";
DROP TABLE "FinancialRecord";
ALTER TABLE "new_FinancialRecord" RENAME TO "FinancialRecord";
CREATE INDEX "FinancialRecord_projectId_idx" ON "FinancialRecord"("projectId");
CREATE INDEX "FinancialRecord_phaseId_idx" ON "FinancialRecord"("phaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
