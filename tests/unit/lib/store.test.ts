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

test("selectFocus city sets focus and clears county / atlas / draft", () => {
  const next = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "pagosa_springs" },
  });
  assert.deepEqual(next.focus, { kind: "city", state: "co", city: "pagosa_springs" });
  assert.equal(next.placeDraft, null);
  assert.equal(focusState(next.focus), "co");
  const q = queryFilters(next);
  assert.equal(q.state, "co");
  assert.equal(q.city, "pagosa_springs");
  assert.equal(q.county, undefined);
  assert.equal(atlasCountyName(next.focus), null);
  assert.equal(next.filters.state, undefined);
  assert.equal(next.filters.page, 1);
});

test("selectFocus county clears city; city then clears county", () => {
  const county = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "county", state: "co", county: "el_paso_county" },
  });
  assert.equal(countyFilter(county.focus, county.placeDraft), "el_paso_county");
  assert.equal(cityFilter(county.focus, county.placeDraft), undefined);

  const city = reduce(county, {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  assert.equal(cityFilter(city.focus, city.placeDraft), "denver");
  assert.equal(countyFilter(city.focus, city.placeDraft), undefined);
});

test("selectFocus atlas does not set a county filter", () => {
  const next = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "atlas", state: "tx", name: "Harris" },
  });
  assert.equal(focusState(next.focus), "tx");
  assert.equal(atlasCountyName(next.focus), "Harris");
  const q = queryFilters(next);
  assert.equal(q.state, "tx");
  assert.equal(q.county, undefined);
  assert.equal(q.city, undefined);
});

test("selectFocus null and selectState null clear place identity", () => {
  const focused = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  const cleared = reduce(focused, { type: "selectFocus", focus: null });
  assert.equal(cleared.focus, null);
  assert.equal(cleared.placeDraft, null);
  assert.equal(queryFilters(cleared).state, undefined);
  assert.equal(queryFilters(cleared).city, undefined);
  assert.equal(atlasCountyName(cleared.focus), null);

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
  assert.equal(next.filters.state, undefined);
  assert.deepEqual(next.focus, { kind: "state", state: "co" });
  const q = queryFilters(next);
  assert.equal(q.state, "co");
  assert.equal(q.city, undefined);
  assert.equal(q.county, undefined);
});

test("resetFilters clears place identity and bumps resetEpoch", () => {
  const start = reduce(
    base(),
    {
      type: "selectFocus",
      focus: { kind: "city", state: "co", city: "denver" },
    },
    { type: "patchFilters", filters: { q: "parking", function: "Rules" } },
  );
  const next = reduce(start, { type: "resetFilters" });
  assert.equal(next.focus, null);
  assert.equal(next.placeDraft, null);
  assert.equal(next.resetEpoch, start.resetEpoch + 1);
  assert.deepEqual(next.filters, {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
  });
});

test("setPlaceText writes draft text without changing the focused state", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  });
  const next = reduce(start, {
    type: "setPlaceText",
    field: "city",
    value: "den",
  });
  assert.deepEqual(next.focus, { kind: "state", state: "co" });
  assert.deepEqual(next.placeDraft, { field: "city", value: "den" });
  assert.equal(queryFilters(next).city, "den");
  assert.equal(queryFilters(next).county, undefined);
});

test("setPlaceText on a city focus keeps the state and drops the city", () => {
  const start = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  const next = reduce(start, {
    type: "setPlaceText",
    field: "county",
    value: "el",
  });
  assert.deepEqual(next.focus, { kind: "state", state: "co" });
  assert.deepEqual(next.placeDraft, { field: "county", value: "el" });
  assert.equal(queryFilters(next).city, undefined);
  assert.equal(queryFilters(next).county, "el");
});
