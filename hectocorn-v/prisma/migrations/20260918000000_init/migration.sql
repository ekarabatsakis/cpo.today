-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusMessage" TEXT,
    "inputRaw" TEXT NOT NULL,
    "inputUsd" TEXT NOT NULL,
    "engineResult" TEXT,
    "engineResultAi" TEXT,
    "aiResult" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "finalPreMoneyUsd" REAL,
    "adjustmentPct" REAL,
    "model" TEXT,
    "promptVersion" TEXT,
    "benchmarksVersion" TEXT,
    "timings" TEXT,
    "error" TEXT
);
