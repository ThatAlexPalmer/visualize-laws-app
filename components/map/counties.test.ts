import assert from "node:assert/strict";
import { test } from "node:test";

import type { CountyFill } from "@/lib/types";

import type { CountyFeatureEntry } from "./counties";
import { joinCountyFills } from "./counties";

const geo = {} as CountyFeatureEntry["geo"];

const FEATURES: CountyFeatureEntry[] = [
  { fips: "48085", stateFips: "48", name: "Collin", geo },
  { fips: "48201", stateFips: "48", name: "Harris", geo },
];

function fill(
  partial: Pick<CountyFill, "source" | "sourcePlace" | "name"> &
    Partial<CountyFill>,
): CountyFill {
  return {
    state: "tx",
    fips: null,
    county: null,
    lawCount: 10,
    substantiveCount: 8,
    avgOpacity: 0.1,
    avgEnforcementDiscretion: 0.2,
    avgPaternalism: 0.3,
    avgProblemSalience: 0.4,
    ...partial,
  };
}

test("native FIPS in the mesh paints and blocks a city on the same FIPS", () => {
  const painted = joinCountyFills(FEATURES, [
    fill({
      source: "county",
      fips: "48085",
      sourcePlace: "collin_county",
      county: "collin_county",
      name: "Collin County",
    }),
    fill({
      source: "city",
      fips: "48085",
      sourcePlace: "plano",
      name: "Collin County · Plano code",
    }),
  ]);
  assert.equal(painted.get("48085")?.source, "county");
  assert.equal(painted.get("48085")?.sourcePlace, "collin_county");
  assert.equal(painted.size, 1);
});

test("native with fips null still name-joins", () => {
  const painted = joinCountyFills(FEATURES, [
    fill({
      source: "county",
      sourcePlace: "harris_county",
      county: "harris_county",
      name: "Harris County",
    }),
  ]);
  assert.equal(painted.get("48201")?.source, "county");
  assert.equal(painted.get("48201")?.sourcePlace, "harris_county");
});

test("native FIPS not in the mesh still name-joins", () => {
  const painted = joinCountyFills(FEATURES, [
    fill({
      source: "county",
      fips: "99999",
      sourcePlace: "harris_county",
      county: "harris_county",
      name: "Harris County",
    }),
  ]);
  assert.equal(painted.has("99999"), false);
  assert.equal(painted.get("48201")?.source, "county");
  assert.equal(painted.get("48201")?.sourcePlace, "harris_county");
});

test("city fills only leftover in-mesh FIPS", () => {
  const painted = joinCountyFills(FEATURES, [
    fill({
      source: "county",
      fips: "48085",
      sourcePlace: "collin_county",
      county: "collin_county",
      name: "Collin County",
    }),
    fill({
      source: "city",
      fips: "48201",
      sourcePlace: "plano",
      name: "Harris County · Plano code",
    }),
    fill({
      source: "city",
      fips: "12345",
      sourcePlace: "ghost",
      name: "Ghost",
    }),
  ]);
  assert.equal(painted.get("48085")?.source, "county");
  assert.equal(painted.get("48201")?.source, "city");
  assert.equal(painted.get("48201")?.sourcePlace, "plano");
  assert.equal(painted.has("12345"), false);
});

test("city row with fips null does not paint", () => {
  const painted = joinCountyFills(FEATURES, [
    fill({
      source: "city",
      sourcePlace: "houston",
      name: "Houston",
    }),
  ]);
  assert.equal(painted.size, 0);
});
