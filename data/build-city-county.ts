/**
 * Build `city_county` + `county_fills` from current `laws` + Census 2020 files.
 * Does not rewrite laws rows and does not re-COPY parquet.
 *
 * Local (after pulling this branch):
 *   pnpm prisma:deploy
 *   pnpm build:city-county
 *
 * `pnpm seed --shards ''` also runs this after recomputing jurisdictions.
 * Census files cache under `.locus-cache/`.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { Client } from "pg";

import {
  CENSUS_COUNTY_URL,
  CENSUS_PLACE_URL,
  indexCountiesByKey,
  matchLocusCities,
  parseCountyFile,
  parsePlaceFile,
  resolveNativeCountyFips,
  type CityCountyMatch,
} from "./cityCounty";
import { prettySlug } from "./slugs";

const CACHE_DIR = resolve(process.cwd(), ".locus-cache");
const PLACE_CACHE = resolve(CACHE_DIR, "national_place2020.txt");
const COUNTY_CACHE = resolve(CACHE_DIR, "national_county2020.txt");

interface CityAggRow {
  state: string;
  city: string;
  law_count: number;
  substantive_count: number;
  avg_opacity: number;
  avg_enforcement_discretion: number;
  avg_paternalism: number;
  avg_problem_salience: number;
}

interface NativeCountyRow {
  state: string;
  county: string;
  name: string;
  law_count: number;
  substantive_count: number;
  avg_opacity: number;
  avg_enforcement_discretion: number;
  avg_paternalism: number;
  avg_problem_salience: number;
}

export interface CityCountyBuildStats {
  cities: number;
  oneCounty: number;
  multi: number;
  unmatched: number;
  nativeFills: number;
  cityFills: number;
  uniqueFips: number;
}

function loadEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      let key = line.slice(0, eq).trim();
      if (key.startsWith("export ")) key = key.slice("export ".length).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function ensureCached(url: string, dest: string): Promise<string> {
  if (existsSync(dest)) return dest;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const tmp = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(tmp),
  );
  const { rename } = await import("node:fs/promises");
  await rename(tmp, dest);
  return dest;
}

function readLatin1(path: string): string {
  return readFileSync(path, "latin1");
}

async function insertChunks(
  client: Client,
  prefix: string,
  rows: unknown[][],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const values: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    for (const row of chunk) {
      const slots = row.map(() => `$${n++}`);
      values.push(`(${slots.join(",")})`);
      params.push(...row);
    }
    await client.query(`${prefix} ${values.join(",")}`, params);
  }
}

function summarize(matches: CityCountyMatch[]): {
  oneCounty: CityCountyMatch[];
  multi: number;
  unmatched: number;
} {
  let multi = 0;
  let unmatched = 0;
  const oneCounty: CityCountyMatch[] = [];
  for (const row of matches) {
    if (row.matchRule === "unmatched") unmatched += 1;
    else if (row.multiCounty || row.matchRule === "multi") multi += 1;
    else oneCounty.push(row);
  }
  return { oneCounty, multi, unmatched };
}

export async function buildCityCountyTables(
  client: Client,
): Promise<CityCountyBuildStats> {
  const placePath = await ensureCached(CENSUS_PLACE_URL, PLACE_CACHE);
  const countyPath = await ensureCached(CENSUS_COUNTY_URL, COUNTY_CACHE);
  const places = parsePlaceFile(readLatin1(placePath));
  const censusCounties = parseCountyFile(readLatin1(countyPath));
  const countyIndex = indexCountiesByKey(censusCounties);

  const cities = await client.query<{ state: string; city: string }>(
    `SELECT DISTINCT state, city
     FROM laws
     WHERE city IS NOT NULL AND city <> ''
     ORDER BY state, city`,
  );
  const matches = matchLocusCities(cities.rows, places, censusCounties);
  const { oneCounty, multi, unmatched } = summarize(matches);

  const cityAggs = await client.query<CityAggRow>(
    `SELECT
       state, city,
       count(*)::int AS law_count,
       count(*) FILTER (WHERE is_substantive)::int AS substantive_count,
       COALESCE(avg(opacity), 0) AS avg_opacity,
       COALESCE(avg(enforcement_discretion), 0) AS avg_enforcement_discretion,
       COALESCE(avg(paternalism), 0) AS avg_paternalism,
       COALESCE(avg(problem_salience), 0) AS avg_problem_salience
     FROM laws
     WHERE city IS NOT NULL AND city <> ''
     GROUP BY state, city`,
  );
  const cityAggByKey = new Map<string, CityAggRow>();
  for (const row of cityAggs.rows) {
    cityAggByKey.set(`${row.state}|${row.city}`, row);
  }

  const natives = await client.query<NativeCountyRow>(
    `SELECT
       state, county, name, law_count, substantive_count,
       avg_opacity, avg_enforcement_discretion, avg_paternalism,
       avg_problem_salience
     FROM jurisdictions
     WHERE level = 'county'
       AND state IS NOT NULL AND county IS NOT NULL`,
  );

  type FillRow = {
    state: string;
    fips: string | null;
    source: "county" | "city";
    sourcePlace: string;
    county: string | null;
    name: string;
    lawCount: number;
    substantiveCount: number;
    avgOpacity: number;
    avgEnforcementDiscretion: number;
    avgPaternalism: number;
    avgProblemSalience: number;
  };

  const fills: FillRow[] = [];
  const nativeFips = new Set<string>();
  for (const row of natives.rows) {
    const resolved = resolveNativeCountyFips(row.state, row.county, countyIndex);
    if (resolved) nativeFips.add(`${row.state}|${resolved.fips}`);
    fills.push({
      state: row.state,
      fips: resolved?.fips ?? null,
      source: "county",
      sourcePlace: row.county,
      county: row.county,
      name: row.name,
      lawCount: row.law_count,
      substantiveCount: row.substantive_count,
      avgOpacity: row.avg_opacity,
      avgEnforcementDiscretion: row.avg_enforcement_discretion,
      avgPaternalism: row.avg_paternalism,
      avgProblemSalience: row.avg_problem_salience,
    });
  }

  const cityByFips = new Map<string, { match: CityCountyMatch; agg: CityAggRow }>();
  for (const match of oneCounty) {
    if (!match.countyFips) continue;
    const agg = cityAggByKey.get(`${match.state}|${match.city}`);
    if (!agg) continue;
    const fipsKey = `${match.state}|${match.countyFips}`;
    if (nativeFips.has(fipsKey)) continue;
    const existing = cityByFips.get(fipsKey);
    if (
      !existing ||
      agg.law_count > existing.agg.law_count ||
      (agg.law_count === existing.agg.law_count &&
        match.city < existing.match.city)
    ) {
      cityByFips.set(fipsKey, { match, agg });
    }
  }

  for (const { match, agg } of cityByFips.values()) {
    fills.push({
      state: match.state,
      fips: match.countyFips,
      source: "city",
      sourcePlace: match.city,
      county: null,
      name: match.countyName ?? prettySlug(match.city),
      lawCount: agg.law_count,
      substantiveCount: agg.substantive_count,
      avgOpacity: agg.avg_opacity,
      avgEnforcementDiscretion: agg.avg_enforcement_discretion,
      avgPaternalism: agg.avg_paternalism,
      avgProblemSalience: agg.avg_problem_salience,
    });
  }

  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM city_county");
    await client.query("DELETE FROM county_fills");
    await insertChunks(
      client,
      `INSERT INTO city_county
         (state, city, county_fips, county_name, atlas_key,
          match_rule, multi_county, county_count)
       VALUES`,
      matches.map((row) => [
        row.state,
        row.city,
        row.countyFips,
        row.countyName,
        row.atlasKey,
        row.matchRule,
        row.multiCounty,
        row.countyCount,
      ]),
    );
    await insertChunks(
      client,
      `INSERT INTO county_fills
         (state, fips, source, source_place, county, name,
          law_count, substantive_count, avg_opacity,
          avg_enforcement_discretion, avg_paternalism, avg_problem_salience)
       VALUES`,
      fills.map((row) => [
        row.state,
        row.fips,
        row.source,
        row.sourcePlace,
        row.county,
        row.name,
        row.lawCount,
        row.substantiveCount,
        row.avgOpacity,
        row.avgEnforcementDiscretion,
        row.avgPaternalism,
        row.avgProblemSalience,
      ]),
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }

  const uniqueFips = new Set(
    fills.map((f) => f.fips).filter((fips): fips is string => Boolean(fips)),
  );

  return {
    cities: matches.length,
    oneCounty: oneCounty.length,
    multi,
    unmatched,
    nativeFills: natives.rows.length,
    cityFills: cityByFips.size,
    uniqueFips: uniqueFips.size,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export async function runCityCountyBuild(): Promise<CityCountyBuildStats> {
  loadEnv();
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL / DATABASE_URL is not set (check your .env.local)");
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const stats = await buildCityCountyTables(client);
    console.log(
      `city_county: ${fmt(stats.cities)} cities → ` +
        `${fmt(stats.oneCounty)} one-county · ${fmt(stats.multi)} multi · ` +
        `${fmt(stats.unmatched)} unmatched`,
    );
    console.log(
      `county_fills: ${fmt(stats.nativeFills)} native + ${fmt(stats.cityFills)} city` +
        ` (${fmt(stats.uniqueFips)} unique FIPS)`,
    );
    return stats;
  } finally {
    await client.end();
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (invokedDirectly()) {
  runCityCountyBuild().catch((err) => {
    console.error("\nCity/county build failed:", err);
    process.exitCode = 1;
  });
}
