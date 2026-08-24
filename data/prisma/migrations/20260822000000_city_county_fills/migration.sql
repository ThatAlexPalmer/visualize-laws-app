-- Additive map-layer tables. Does not rewrite laws.city / laws.county
-- or reuse jurisdictions unique (level, state, county) for city stand-ins.

CREATE TABLE "city_county" (
    "id" SERIAL NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "county_fips" TEXT,
    "county_name" TEXT,
    "atlas_key" TEXT,
    "match_rule" TEXT NOT NULL,
    "multi_county" BOOLEAN NOT NULL,
    "county_count" INTEGER NOT NULL,

    CONSTRAINT "city_county_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "county_fills" (
    "id" SERIAL NOT NULL,
    "state" TEXT NOT NULL,
    "fips" TEXT,
    "source" TEXT NOT NULL,
    "source_place" TEXT NOT NULL,
    "county" TEXT,
    "name" TEXT NOT NULL,
    "law_count" INTEGER NOT NULL,
    "substantive_count" INTEGER NOT NULL,
    "avg_opacity" DOUBLE PRECISION NOT NULL,
    "avg_enforcement_discretion" DOUBLE PRECISION NOT NULL,
    "avg_paternalism" DOUBLE PRECISION NOT NULL,
    "avg_problem_salience" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "county_fills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "city_county_state_city_key" ON "city_county"("state", "city");
CREATE INDEX "city_county_state_idx" ON "city_county"("state");
CREATE INDEX "city_county_county_fips_idx" ON "city_county"("county_fips");

CREATE UNIQUE INDEX "county_fills_source_state_source_place_key"
    ON "county_fills"("source", "state", "source_place");
CREATE INDEX "county_fills_state_idx" ON "county_fills"("state");
CREATE INDEX "county_fills_fips_idx" ON "county_fills"("fips");
