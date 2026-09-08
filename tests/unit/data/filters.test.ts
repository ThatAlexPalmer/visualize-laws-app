import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filtersToSearchParams,
  hasPenaltyFilter,
  searchParamsToFilters,
  shouldUseSavedScopeTotal,
} from "@/data/filters";
import { isSortKey, type LawFilters } from "@/data/types";

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

test("shouldUseSavedScopeTotal: empty or state-only WHERE reuses the saved total", () => {
  assert.equal(shouldUseSavedScopeTotal([]), true);
  assert.equal(shouldUseSavedScopeTotal(["laws.state = $1"]), true);
  // Sort / page never appear in WHERE, so they do not change the decision.
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1"], ["laws.state = $1"]),
    true,
  );
});

test("shouldUseSavedScopeTotal: extra WHERE fragments keep their own count", () => {
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.city IN ($2)"]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.county ILIKE $2 ESCAPE '\\'"]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", `laws."function" = $2`]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.topic = $2"]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.is_substantive = $2"]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.opacity >= $2"]),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.paternalism <= $2"]),
    false,
  );
  // A predicate that is not on any historical filter list still disables —
  // the decision is the WHERE that was built, not a parallel field list.
  assert.equal(
    shouldUseSavedScopeTotal(["laws.state = $1", "laws.source_jurisdiction_type = $2"]),
    false,
  );
});

test("a penalty WHERE fragment disables the saved scope total", () => {
  assert.equal(
    shouldUseSavedScopeTotal([
      "laws.state = $1",
      "EXISTS (SELECT 1 FROM law_fines lf WHERE lf.law_id = laws.id AND lf.effective_max IS NOT NULL)",
    ]),
    false,
  );
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

test("a row-only predicate disables the saved scope total", () => {
  // Fine sort adds `lfs.effective_max IS NOT NULL` to the rows WHERE only.
  assert.equal(
    shouldUseSavedScopeTotal(
      ["laws.state = $1"],
      ["laws.state = $1", "lfs.effective_max IS NOT NULL"],
    ),
    false,
  );
  // An axis sort does not add a row-only predicate, so the saved total stands.
  assert.equal(shouldUseSavedScopeTotal(["laws.state = $1"]), true);
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

test("prototype properties are not sort columns", () => {
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(isSortKey(key), false);
    assert.equal(fromQs(`sort=${key}`).sort, undefined);
  }
});

test("pagination rejects non-finite, fractional and unsafe offsets", () => {
  for (const page of ["Infinity", "-Infinity", "NaN", "1.5", "9007199254740991"]) {
    const f = fromQs(`page=${page}&pageSize=100`);
    assert.equal(f.page, 1);
    assert.ok(Number.isSafeInteger((f.page - 1) * f.pageSize));
  }
  for (const size of ["Infinity", "-2", "2.5"]) {
    assert.equal(fromQs(`pageSize=${size}`).pageSize, 25);
  }
  assert.equal(fromQs("pageSize=101").pageSize, 100);
});
