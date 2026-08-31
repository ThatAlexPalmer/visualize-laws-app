import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filtersToSearchParams,
  hasPenaltyFilter,
  searchParamsToFilters,
  shouldUseSavedScopeTotal,
} from "./filters";
import { isSortKey, type LawFilters } from "./types";

function fromQs(qs = ""): LawFilters {
  return searchParamsToFilters(new URLSearchParams(qs));
}

function roundTrip(f: LawFilters): LawFilters {
  return searchParamsToFilters(filtersToSearchParams(f));
}

test("searchParamsToFilters defaults page 1 and pageSize 25", () => {
  const f = fromQs();
  assert.equal(f.page, 1);
  assert.equal(f.pageSize, 25);
});

test("round-trip serialize/parse for q, place, axes, penalties, sort, page, fineMin=0", () => {
  const original: LawFilters = {
    q: "water",
    state: "co",
    city: "denver",
    county: "el_paso",
    function: "Zoning",
    topic: "Animals",
    isSubstantive: true,
    opacity: { min: 0, max: 1 },
    enforcementDiscretion: { min: -2, max: 0.5 },
    paternalism: { min: -1, max: 2 },
    problemSalience: { min: 0.25, max: 3 },
    hasFine: true,
    perDay: true,
    jail: true,
    penaltyNature: "criminal",
    fineMin: 0,
    fineMax: 1000,
    page: 2,
    pageSize: 8,
    sort: { key: "opacity", dir: "desc" },
  };
  const parsed = roundTrip(original);
  assert.deepEqual(parsed, original);
});

test("isSubstantive false serializes as the string false and round-trips", () => {
  const parsed = roundTrip({ page: 1, pageSize: 25, isSubstantive: false });
  assert.equal(parsed.isSubstantive, false);
  const sp = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    isSubstantive: false,
  });
  assert.equal(sp.get("isSubstantive"), "false");
});

test("booleans hasFine/perDay/jail serialize only when true", () => {
  const off = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    hasFine: false,
    perDay: false,
    jail: false,
  });
  assert.equal(off.get("hasFine"), null);
  assert.equal(off.get("perDay"), null);
  assert.equal(off.get("jail"), null);

  const on = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    hasFine: true,
    perDay: true,
    jail: true,
  });
  assert.equal(on.get("hasFine"), "true");
  assert.equal(on.get("perDay"), "true");
  assert.equal(on.get("jail"), "true");
});

test("sort/dir are omitted unless sort is a whitelisted key", () => {
  const none = filtersToSearchParams({ page: 1, pageSize: 25, sort: null });
  assert.equal(none.get("sort"), null);
  assert.equal(none.get("dir"), null);

  const fine = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    sort: { key: "fine", dir: "asc" },
  });
  assert.equal(fine.get("sort"), "fine");
  assert.equal(fine.get("dir"), "asc");
});

test("penaltyNature is serialized only when it is in the vocabulary", () => {
  const ok = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    penaltyNature: "civil",
  });
  assert.equal(ok.get("penaltyNature"), "civil");
});

test("axis min/max use ${axis.key}Min / ${axis.key}Max", () => {
  const sp = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    opacity: { min: -0.5, max: 1.25 },
  });
  assert.equal(sp.get("opacityMin"), "-0.5");
  assert.equal(sp.get("opacityMax"), "1.25");
});

test("shouldUseSavedScopeTotal: US and state-only reuse the saved total", () => {
  assert.equal(shouldUseSavedScopeTotal(fromQs()), true);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co")), true);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&page=2&pageSize=8")), true);
  assert.equal(
    shouldUseSavedScopeTotal(fromQs("state=co&sort=opacity&dir=desc")),
    true,
  );
});

test("shouldUseSavedScopeTotal: extra filters keep their own count", () => {
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&q=water")), false);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&city=denver")), false);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&county=denver")), false);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&function=zoning")), false);
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&topic=animals")), false);
  assert.equal(
    shouldUseSavedScopeTotal(fromQs("state=co&isSubstantive=true")),
    false,
  );
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&opacityMin=0")), false);
  assert.equal(
    shouldUseSavedScopeTotal(fromQs("state=co&paternalismMax=1")),
    false,
  );
});

test("a penalty filter disables the saved scope total", () => {
  // The saved jurisdiction count covers every law; a penalty filter narrows to
  // the model-read subset, so reusing it would badly overstate the result count.
  for (const qs of [
    "state=co&hasFine=true",
    "state=co&jail=true",
    "state=co&perDay=true",
    "state=co&fineMin=100",
    "state=co&fineMax=1000",
    "state=co&penaltyNature=criminal",
  ]) {
    assert.equal(shouldUseSavedScopeTotal(fromQs(qs)), false, qs);
  }
});

test("hasPenaltyFilter ignores absent, false and malformed values", () => {
  assert.equal(hasPenaltyFilter(fromQs()), false);
  assert.equal(hasPenaltyFilter(fromQs("state=co")), false);
  // Only the literal "true" turns a boolean filter on.
  assert.equal(hasPenaltyFilter(fromQs("hasFine=false")), false);
  assert.equal(hasPenaltyFilter(fromQs("jail=1")), false);
  assert.equal(hasPenaltyFilter(fromQs("perDay=")), false);
  assert.equal(hasPenaltyFilter({ page: 1, pageSize: 25, hasFine: false }), false);
  // Non-numeric bounds are not a filter.
  assert.equal(hasPenaltyFilter(fromQs("fineMin=abc")), false);
  assert.equal(hasPenaltyFilter(fromQs("fineMin=")), false);
  // 0 is a real lower bound and must count.
  assert.equal(hasPenaltyFilter(fromQs("fineMin=0")), true);
});

test("sorting by fine disables the saved scope total", () => {
  // Fine sort only ranks laws that state one, so the saved jurisdiction count
  // would be far too high.
  assert.equal(
    shouldUseSavedScopeTotal(fromQs("state=co&sort=fine&dir=desc")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal({
      page: 1,
      pageSize: 25,
      state: "co",
      sort: { key: "fine", dir: "desc" },
    }),
    false,
  );
  // An axis sort still reuses it — sorting alone does not narrow the set.
  assert.equal(shouldUseSavedScopeTotal(fromQs("state=co&sort=opacity")), true);
});

test("penaltyNature is whitelisted against the source vocabulary", () => {
  for (const nature of ["criminal", "civil", "both"] as const) {
    assert.equal(hasPenaltyFilter(fromQs(`penaltyNature=${nature}`)), true, nature);
  }
  // Anything outside the vocabulary is dropped rather than reaching SQL.
  assert.equal(hasPenaltyFilter(fromQs("penaltyNature=CRIMINAL")), false);
  assert.equal(hasPenaltyFilter(fromQs("penaltyNature=' OR 1=1--")), false);
  const dropped = fromQs("penaltyNature=CRIMINAL");
  assert.equal(dropped.penaltyNature, undefined);
});

test("isSortKey still gates sort on the wire", () => {
  const parsed = fromQs("sort=fine; DROP&dir=desc");
  assert.equal(parsed.sort, undefined);
  assert.equal(isSortKey("fine"), true);
});
