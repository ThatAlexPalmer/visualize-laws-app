import assert from "node:assert/strict";
import { test } from "node:test";

import { matchCountySlug, resolveCountySlug } from "@/data/slugs";

const counties = [
  { county: "el_paso_county" },
  { county: "denver" },
  { county: "saint_marys_county" },
];

test("resolveCountySlug is the only client fallback — no raw input", () => {
  assert.equal(resolveCountySlug(counties, "El Paso"), "el_paso_county");
  assert.equal(resolveCountySlug(counties, "el_paso_county"), "el_paso_county");
  assert.equal(resolveCountySlug(counties, "St. Mary's"), "saint_marys_county");
  assert.equal(resolveCountySlug(counties, "nowhere"), null);
  assert.equal(resolveCountySlug([], "El Paso"), null);
  assert.equal(resolveCountySlug(undefined, "El Paso"), null);
  assert.equal(resolveCountySlug(counties, "  "), null);
  assert.equal(resolveCountySlug(counties, null), null);
});

test("matchCountySlug still prefers a county-kind slug", () => {
  assert.equal(matchCountySlug(counties, "denver"), "denver");
  assert.equal(matchCountySlug([{ county: "el_paso" }, { county: "el_paso_county" }], "El Paso"), "el_paso_county");
});
