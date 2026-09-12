import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("map and panel consume the provider county slug; they do not re-resolve", () => {
  const provider = readFileSync(
    "components/jurisdiction/JurisdictionsProvider.tsx",
    "utf8",
  );
  const panel = readFileSync(
    "components/jurisdiction/JurisdictionPanel.tsx",
    "utf8",
  );
  const map = readFileSync("components/map/MapViewProvider.tsx", "utf8");

  assert.match(provider, /countyDetailRequest\(/);
  assert.match(provider, /resolvedCountySlug/);
  assert.match(panel, /resolvedCountySlug/);
  assert.doesNotMatch(panel, /resolveCountySlug/);
  assert.match(map, /resolvedCountySlug/);
  assert.doesNotMatch(map, /countyDetailRequest/);
});
