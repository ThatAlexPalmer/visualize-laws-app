-- Additive: legacy completed shards remain valid; no corpus rows are rewritten.
CREATE TABLE "import_progress" (
  "source" TEXT PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "rows_loaded" INTEGER NOT NULL DEFAULT 0 CHECK ("rows_loaded" >= 0),
  "complete" BOOLEAN NOT NULL DEFAULT false
);
