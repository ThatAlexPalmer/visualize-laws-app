-- Additive LOCUS-Fines penalty layer. One row per `laws` row that the
-- supplement's model actually read (annotation_source = 'LLM'); an absent row
-- means "never sent to the model", which is not the same as "no penalty".
-- Does not modify `laws`.

-- digest(..., 'sha1') powers the join back to LOCUS-v1: the supplement ships
-- no law text, only the first 16 hex chars of sha1(content) as `content_sha1`.
-- Postgres core has md5 + sha2 but no sha1, so pgcrypto is required.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "law_fines" (
    "id" SERIAL NOT NULL,
    "law_id" INTEGER NOT NULL,

    -- Denormalized jurisdiction identity, so per-place aggregates are a single
    -- table scan (same rationale as county_fills). Verbatim LOCUS slugs.
    "state" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    -- Retained so a rebuild after a re-seed is verifiable, and so a future
    -- LOCUS revision that changes law text is detectable as drift.
    "content_sha1" TEXT NOT NULL,
    "annotation_source" TEXT NOT NULL,

    "fine_relevant" BOOLEAN NOT NULL,
    "penalty_scope" TEXT,
    "penalty_stated" TEXT,
    "fine_structure" TEXT,
    "fixed_amount" DOUBLE PRECISION,
    "min_amount" DOUBLE PRECISION,
    "max_amount" DOUBLE PRECISION,
    "first_violation_amount" DOUBLE PRECISION,
    "second_violation_amount" DOUBLE PRECISION,
    "subsequent_violation_amount" DOUBLE PRECISION,
    "effective_min" DOUBLE PRECISION,
    "effective_max" DOUBLE PRECISION,
    "per_day_violation" BOOLEAN NOT NULL,
    "jail_mentioned" BOOLEAN NOT NULL,
    "penalty_nature" TEXT,
    "extraction_flag" TEXT,
    "grounded" BOOLEAN,

    CONSTRAINT "law_fines_pkey" PRIMARY KEY ("id")
);

-- One annotation per law. The supplement's seven-column identity key is NOT
-- unique in LOCUS-v1 (~2.4k duplicate groups), so the loader dedupes the fines
-- side; this constraint is the backstop that keeps a fan-out from landing.
CREATE UNIQUE INDEX "law_fines_law_id_key" ON "law_fines"("law_id");
CREATE INDEX "law_fines_state_idx" ON "law_fines"("state");
CREATE INDEX "law_fines_penalty_stated_idx" ON "law_fines"("penalty_stated");
CREATE INDEX "law_fines_effective_max_idx" ON "law_fines"("effective_max");

ALTER TABLE "law_fines"
    ADD CONSTRAINT "law_fines_law_id_fkey"
    FOREIGN KEY ("law_id") REFERENCES "laws"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
