-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "laws" (
    "id" SERIAL NOT NULL,
    "header" TEXT,
    "content" TEXT NOT NULL,
    "is_substantive" BOOLEAN NOT NULL,
    "function" TEXT,
    "topic" TEXT,
    "source_jurisdiction_type" TEXT,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    "enforcement_discretion" DOUBLE PRECISION NOT NULL,
    "opacity" DOUBLE PRECISION NOT NULL,
    "paternalism" DOUBLE PRECISION NOT NULL,
    "problem_salience" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "laws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurisdictions" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "state" TEXT,
    "county" TEXT,
    "name" TEXT NOT NULL,
    "law_count" INTEGER NOT NULL,
    "substantive_count" INTEGER NOT NULL,
    "avg_opacity" DOUBLE PRECISION NOT NULL,
    "avg_enforcement_discretion" DOUBLE PRECISION NOT NULL,
    "avg_paternalism" DOUBLE PRECISION NOT NULL,
    "avg_problem_salience" DOUBLE PRECISION NOT NULL,
    "bounds" JSONB,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_checkpoints" (
    "id" SERIAL NOT NULL,
    "shard" TEXT NOT NULL,
    "rows_loaded" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seed_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laws_state_idx" ON "laws"("state");

-- CreateIndex
CREATE INDEX "laws_state_county_idx" ON "laws"("state", "county");

-- CreateIndex
CREATE INDEX "laws_function_idx" ON "laws"("function");

-- CreateIndex
CREATE INDEX "laws_topic_idx" ON "laws"("topic");

-- CreateIndex
CREATE INDEX "laws_is_substantive_idx" ON "laws"("is_substantive");

-- CreateIndex
CREATE INDEX "laws_opacity_idx" ON "laws"("opacity");

-- CreateIndex
CREATE INDEX "laws_enforcement_discretion_idx" ON "laws"("enforcement_discretion");

-- CreateIndex
CREATE INDEX "laws_paternalism_idx" ON "laws"("paternalism");

-- CreateIndex
CREATE INDEX "laws_problem_salience_idx" ON "laws"("problem_salience");

-- CreateIndex
CREATE INDEX "jurisdictions_level_idx" ON "jurisdictions"("level");

-- CreateIndex
CREATE UNIQUE INDEX "jurisdictions_level_state_county_key" ON "jurisdictions"("level", "state", "county");

-- CreateIndex
CREATE UNIQUE INDEX "seed_checkpoints_shard_key" ON "seed_checkpoints"("shard");


-- Full-text search: generated tsvector column + GIN index.
-- (Managed via raw SQL because Prisma cannot express GENERATED columns.)
ALTER TABLE "laws"
    ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce("header", '') || ' ' || "content")) STORED;

CREATE INDEX "laws_search_vector_idx" ON "laws" USING GIN ("search_vector");
