import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PAGE_SIZE,
  explorerReducer,
  queryFilters,
  type ExplorerAction,
  type ExplorerState,
} from "@/lib/store";
import { atlasCountyName, cityFilter, countyFilter, focusState } from "@/lib/place";

function base(): ExplorerState {
  return {
    axis: "opacity",
    layer: "scores",
    filters: { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null },
    focus: null,
    placeDraft: null,
    selectedLaw: null,
    unhinged: false,
    filtersOpen: false,
    resetEpoch: 0,
  };
}

function reduce(start: ExplorerState, ...actions: ExplorerAction[]): ExplorerState {
  return actions.reduce(explorerReducer, start);
}

test("place focus picks one place and clears the others", () => {
  const city = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "pagosa_springs" },
  });
  assert.equal(focusState(city.focus), "co");
  assert.equal(queryFilters(city).city, "pagosa_springs");
  assert.equal(queryFilters(city).county, undefined);
  assert.equal(city.filters.city, undefined);
  assert.equal(city.filters.page, 1);

  const county = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "county", state: "co", county: "el_paso_county" },
  });
  assert.equal(countyFilter(county.focus, county.placeDraft), "el_paso_county");
  assert.equal(cityFilter(county.focus, county.placeDraft), undefined);
  const backToCity = reduce(county, {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  assert.equal(cityFilter(backToCity.focus, backToCity.placeDraft), "denver");
  assert.equal(countyFilter(backToCity.focus, backToCity.placeDraft), undefined);

  const atlas = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "atlas", state: "tx", name: "Harris" },
  });
  assert.equal(atlasCountyName(atlas.focus), "Harris");
  assert.equal(queryFilters(atlas).state, "tx");
  assert.equal(queryFilters(atlas).county, undefined);
  assert.equal(queryFilters(atlas).city, undefined);

  const cleared = reduce(city, { type: "selectFocus", focus: null });
  assert.equal(cleared.focus, null);
  assert.equal(queryFilters(cleared).state, undefined);
  assert.deepEqual(reduce(city, { type: "selectState", state: null }), cleared);
});

test("filters cannot set a place, and reset clears the place", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  }, { type: "patchFilters", filters: { q: "parking", function: "Rules" } });
  const patched = reduce(start, {
    type: "patchFilters",
    filters: { city: "denver", county: "el_paso_county", state: "tx", q: "water" },
  });
  assert.equal(patched.filters.q, "water");
  assert.equal(patched.filters.city, undefined);
  assert.equal(patched.filters.state, undefined);
  assert.equal(queryFilters(patched).state, "co");
  assert.equal(queryFilters(patched).city, undefined);

  const reset = reduce(patched, { type: "resetFilters" });
  assert.equal(reset.focus, null);
  assert.equal(reset.placeDraft, null);
  assert.equal(reset.resetEpoch, patched.resetEpoch + 1);
  assert.deepEqual(reset.filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null });
});

test("typed place text filters without changing the state", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  const countyText = reduce(start, { type: "setPlaceText", field: "county", value: "el" });
  assert.deepEqual(countyText.focus, { kind: "state", state: "co" });
  assert.equal(queryFilters(countyText).city, undefined);
  assert.equal(queryFilters(countyText).county, "el");

  const stateOnly = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  });
  const cityText = reduce(stateOnly, { type: "setPlaceText", field: "city", value: "den" });
  assert.deepEqual(cityText.focus, { kind: "state", state: "co" });
  assert.equal(queryFilters(cityText).city, "den");
  assert.equal(queryFilters(cityText).county, undefined);
});
