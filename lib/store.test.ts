import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PAGE_SIZE,
  explorerReducer,
  type ExplorerAction,
  type ExplorerState,
} from "./store";

function base(): ExplorerState {
  return {
    axis: "opacity",
    layer: "scores",
    filters: { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null },
    selectedState: null,
    atlasCountyName: null,
    selectedLaw: null,
    unhinged: false,
    filtersOpen: false,
    filterResetVersion: 0,
  };
}

function reduce(start: ExplorerState, ...actions: ExplorerAction[]): ExplorerState {
  return actions.reduce(explorerReducer, start);
}

test("selectFocus city sets state + city and clears county / atlas", () => {
  const next = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "pagosa_springs" },
  });
  assert.equal(next.selectedState, "co");
  assert.equal(next.filters.state, "co");
  assert.equal(next.filters.city, "pagosa_springs");
  assert.equal(next.filters.county, undefined);
  assert.equal(next.atlasCountyName, null);
  assert.equal(next.filters.page, 1);
});

test("selectFocus county clears city; city then clears county", () => {
  const county = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "county", state: "co", county: "el_paso_county" },
  });
  assert.equal(county.filters.county, "el_paso_county");
  assert.equal(county.filters.city, undefined);

  const city = reduce(county, {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  assert.equal(city.filters.city, "denver");
  assert.equal(city.filters.county, undefined);
});

test("selectFocus atlas does not set a county filter", () => {
  const next = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "atlas", state: "tx", name: "Harris" },
  });
  assert.equal(next.selectedState, "tx");
  assert.equal(next.atlasCountyName, "Harris");
  assert.equal(next.filters.county, undefined);
  assert.equal(next.filters.city, undefined);
});

test("selectFocus null and selectState null clear place identity", () => {
  const focused = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  const cleared = reduce(focused, { type: "selectFocus", focus: null });
  assert.equal(cleared.selectedState, null);
  assert.equal(cleared.filters.state, undefined);
  assert.equal(cleared.filters.city, undefined);
  assert.equal(cleared.atlasCountyName, null);

  const viaSelectState = reduce(focused, { type: "selectState", state: null });
  assert.deepEqual(viaSelectState, cleared);
});

test("patchFilters cannot sneak a city, county, or state", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  });
  const next = reduce(start, {
    type: "patchFilters",
    filters: { city: "denver", county: "el_paso_county", state: "tx", q: "water" },
  });
  assert.equal(next.filters.q, "water");
  assert.equal(next.filters.city, undefined);
  assert.equal(next.filters.county, undefined);
  assert.equal(next.filters.state, "co");
  assert.equal(next.selectedState, "co");
});

test("setPlaceText writes filter text without changing selectedState", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  });
  const next = reduce(start, {
    type: "setPlaceText",
    field: "city",
    value: "den",
  });
  assert.equal(next.selectedState, "co");
  assert.equal(next.filters.city, "den");
  assert.equal(next.filters.county, undefined);
});
