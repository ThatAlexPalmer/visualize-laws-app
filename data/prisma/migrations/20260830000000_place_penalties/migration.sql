-- Per-place LOCUS-Fines aggregates that drive the Penalties map layer.
--
-- A sibling table rather than columns on `jurisdictions` / `county_fills`:
-- `data/build-city-county.ts` rebuilds those two with DELETE + re-INSERT, so
-- penalty columns living there would be silently wiped by an unrelated
-- `pnpm build:city-county`. Keeping them here lets `pnpm build:fines` own
-- them outright, in either order.
--
-- `place` is COALESCE(city, county) — city and county are mutually exclusive
-- on a LOCUS row, and that value is exactly `county_fills.source_place`, so
-- the map joins on (state, place) with no extra mapping.

CREATE TABLE "place_penalties" (
    "id" SERIAL NOT NULL,
    -- 'national' (state + place NULL) | 'state' (place NULL) | 'place'
    "level" TEXT NOT NULL,
    "state" TEXT,
    "place" TEXT,

    -- Sections the supplement's model read here. The denominator for every
    -- share: dividing by all laws instead correlates with how much of a state
    -- was sampled (r = 0.46) rather than with the codes themselves (r = 0.11).
    "penalty_sections" INTEGER NOT NULL,
    "amount_sections" INTEGER NOT NULL,
    "jail_sections" INTEGER NOT NULL,
    "per_day_sections" INTEGER NOT NULL,
    -- NULL when too few amount sections back it to mean anything.
    "median_fine" DOUBLE PRECISION,

    CONSTRAINT "place_penalties_pkey" PRIMARY KEY ("id")
);

-- Plain UNIQUE (NULLs compare distinct here, as in `jurisdictions`). The
-- builder rebuilds this table with DELETE + INSERT inside one transaction, so
-- it never relies on conflict handling and never accumulates NULL duplicates.
-- Kept expressible in schema.prisma so the schema cannot drift.
CREATE UNIQUE INDEX "place_penalties_level_state_place_key"
    ON "place_penalties"("level", "state", "place");
CREATE INDEX "place_penalties_state_idx" ON "place_penalties"("state");
