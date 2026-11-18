import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PAGE_SIZE,
  explorerReducer,
  queryFilters,
  type ExplorerAction,
  type ExplorerState,
} from "@/lib/store";
import { atlasCountyName } from "@/lib/place";
import type { PlaceFocus } from "@/lib/types";

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

test("place focus is mutually exclusive and the query follows it", () => {
  const cases: Array<{ focus: PlaceFocus; city?: string; county?: string; atlas?: string }> = [
    { focus: { kind: "city", state: "co", city: "pagosa_springs" }, city: "pagosa_springs" },
    { focus: { kind: "county", state: "co", county: "el_paso_county" }, county: "el_paso_county" },
    { focus: { kind: "atlas", state: "tx", name: "Harris" }, atlas: "Harris" },
  ];
  for (const c of cases) {
    const next = reduce(base(), { type: "selectFocus", focus: c.focus });
    const q = queryFilters(next);
    assert.deepEqual(next.focus, c.focus);
    assert.equal(next.placeDraft, null);
    assert.equal(q.state, c.focus.state);
    assert.equal(q.city, c.city);
    assert.equal(q.county, c.county);
    assert.equal(atlasCountyName(next.focus), c.atlas ?? null);
    assert.equal(next.filters.state, undefined);
    assert.equal(next.filters.page, 1);
  }

  const county = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "county", state: "co", county: "el_paso_county" },
  });
  const city = reduce(county, {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  assert.equal(queryFilters(city).city, "denver");
  assert.equal(queryFilters(city).county, undefined);

  const cleared = reduce(city, { type: "selectFocus", focus: null });
  assert.equal(cleared.focus, null);
  assert.equal(cleared.placeDraft, null);
  assert.equal(queryFilters(cleared).state, undefined);
  assert.equal(queryFilters(cleared).city, undefined);
  assert.deepEqual(reduce(city, { type: "selectState", state: null }), cleared);
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

test("typed place text filters without zooming to a new place", () => {
  const state = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "state", state: "co" },
  });
  const cityDraft = reduce(state, { type: "setPlaceText", field: "city", value: "den" });
  assert.deepEqual(cityDraft.focus, { kind: "state", state: "co" });
  assert.deepEqual(cityDraft.placeDraft, { field: "city", value: "den" });
  assert.equal(queryFilters(cityDraft).city, "den");
  assert.equal(queryFilters(cityDraft).county, undefined);

  const fromCity = reduce(base(), {
    type: "selectFocus",
    focus: { kind: "city", state: "co", city: "denver" },
  });
  const countyDraft = reduce(fromCity, { type: "setPlaceText", field: "county", value: "el" });
  assert.deepEqual(countyDraft.focus, { kind: "state", state: "co" });
  assert.deepEqual(countyDraft.placeDraft, { field: "county", value: "el" });
  assert.equal(queryFilters(countyDraft).city, undefined);
  assert.equal(queryFilters(countyDraft).county, "el");
});
