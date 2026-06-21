-- Performance indexes for search / filter / sort over `laws` (~2.2M rows).
-- Additive only: CREATE ... IF NOT EXISTS, no data changes, nothing dropped.

-- pg_trgm powers fast substring (ILIKE '%x%') matching via GIN trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN index for the `county ILIKE '%x%'` filter (data/queries/laws.ts).
-- Deliberately NOT indexing `content` with trigrams: keyword search already uses
-- the generated `search_vector` GIN, and a trigram index over 2.2M long
-- documents would be enormous and slow to build.
CREATE INDEX IF NOT EXISTS "laws_county_trgm_idx"
    ON "laws" USING GIN ("county" gin_trgm_ops);

-- Composite btree indexes for the high-value "filter by state + sort by axis"
-- and "filter by state + substantive" access patterns. A leading `state`
-- equality plus the axis lets Postgres satisfy the filter and (near-)ordering
-- from one index instead of scanning + sorting the per-state slice.
CREATE INDEX IF NOT EXISTS "laws_state_opacity_idx"
    ON "laws" ("state", "opacity");
CREATE INDEX IF NOT EXISTS "laws_state_enforcement_discretion_idx"
    ON "laws" ("state", "enforcement_discretion");
CREATE INDEX IF NOT EXISTS "laws_state_paternalism_idx"
    ON "laws" ("state", "paternalism");
CREATE INDEX IF NOT EXISTS "laws_state_problem_salience_idx"
    ON "laws" ("state", "problem_salience");
CREATE INDEX IF NOT EXISTS "laws_state_is_substantive_idx"
    ON "laws" ("state", "is_substantive");
