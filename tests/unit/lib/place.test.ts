import assert from "node:assert/strict";
import { test } from "node:test";

import {
  atlasCountyName,
  cityFilter,
  countyFilter,
  focusesEqual,
  focusState,
  placeFilterFields,
} from "@/lib/place";
import type { PlaceFocus } from "@/lib/types";

test("derived place fields come from focus + draft, not parallel store keys", () => {
  const city: PlaceFocus = { kind: "city", state: "co", city: "denver" };
  assert.equal(focusState(city), "co");
  assert.equal(atlasCountyName(city), null);
  assert.deepEqual(placeFilterFields(city, null), {
    state: "co",
    city: "denver",
    county: undefined,
  });

  const atlas: PlaceFocus = { kind: "atlas", state: "tx", name: "Harris" };
  assert.equal(atlasCountyName(atlas), "Harris");
  assert.deepEqual(placeFilterFields(atlas, null), {
    state: "tx",
    city: undefined,
    county: undefined,
  });

  const draft = { field: "county" as const, value: "el" };
  assert.equal(countyFilter({ kind: "state", state: "co" }, draft), "el");
  assert.equal(cityFilter({ kind: "state", state: "co" }, draft), undefined);
});

test("focusesEqual compares kind + members", () => {
  const a: PlaceFocus = { kind: "county", state: "co", county: "el_paso_county" };
  assert.equal(focusesEqual(a, { ...a }), true);
  assert.equal(focusesEqual(a, { kind: "state", state: "co" }), false);
  assert.equal(focusesEqual(null, null), true);
  assert.equal(focusesEqual(a, null), false);
});
