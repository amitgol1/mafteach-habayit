/*
  Warnings:

  - You are about to drop the column `messageText` on the `Update` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Update" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subPhaseId" INTEGER,
    "projectId" INTEGER,
    "userId" INTEGER NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Update_subPhaseId_fkey" FOREIGN KEY ("subPhaseId") REFERENCES "SubPhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Update_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Update_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Update" ("id", "mediaType", "mediaUrl", "projectId", "subPhaseId", "timestamp", "userId") SELECT "id", "mediaType", "mediaUrl", "projectId", "subPhaseId", "timestamp", "userId" FROM "Update";
DROP TABLE "Update";
ALTER TABLE "new_Update" RENAME TO "Update";
CREATE INDEX "Update_subPhaseId_idx" ON "Update"("subPhaseId");
CREATE INDEX "Update_projectId_idx" ON "Update"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
