-- Additive Law indexes for city filter / join. Plain CREATE INDEX (Prisma
-- wraps migrations in a transaction, so CONCURRENTLY is not used).

-- Composite btree for the high-value "filter by state + city" access pattern.
CREATE INDEX IF NOT EXISTS "laws_state_city_idx"
    ON "laws" ("state", "city");

-- Trigram GIN index for the `city ILIKE '%x%'` filter (data/queries/laws.ts).
CREATE INDEX IF NOT EXISTS "laws_city_trgm_idx"
    ON "laws" USING GIN ("city" gin_trgm_ops);
