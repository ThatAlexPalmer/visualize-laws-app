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

test("search params round-trip, and false substantive stays the string false", () => {
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
  assert.deepEqual(roundTrip(original), original);

  const off = filtersToSearchParams({ page: 1, pageSize: 25, isSubstantive: false });
  assert.equal(off.get("isSubstantive"), "false");
  assert.equal(roundTrip({ page: 1, pageSize: 25, isSubstantive: false }).isSubstantive, false);
});

test("penalty flags serialize only when true", () => {
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

test("sort is omitted unless the key is a real column", () => {
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

  for (const key of ["fine", "opacity", "enforcementDiscretion", "paternalism", "problemSalience"]) {
    assert.equal(isSortKey(key), true, key);
  }
  for (const key of [
    "content",
    "id",
    "effective_max",
    "",
    "fine; DROP",
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
  ]) {
    assert.equal(isSortKey(key), false, key);
    assert.equal(fromQs(`sort=${key}`).sort, undefined, key);
  }
});

test("penaltyNature is kept only for the source vocabulary", () => {
  assert.equal(
    filtersToSearchParams({ page: 1, pageSize: 25, penaltyNature: "civil" }).get("penaltyNature"),
    "civil",
  );
  for (const nature of ["criminal", "civil", "both"] as const) {
    assert.equal(hasPenaltyFilter(fromQs(`penaltyNature=${nature}`)), true, nature);
  }
  assert.equal(hasPenaltyFilter(fromQs("penaltyNature=CRIMINAL")), false);
  assert.equal(hasPenaltyFilter(fromQs("penaltyNature=' OR 1=1--")), false);
  assert.equal(fromQs("penaltyNature=CRIMINAL").penaltyNature, undefined);
});

test("saved scope totals apply only to an empty or state-only WHERE", () => {
  const state = "laws.state = $1";
  const cases: Array<{ where: string[]; rows?: string[]; saved: boolean }> = [
    { where: [], saved: true },
    { where: [state], saved: true },
    { where: [state], rows: [state], saved: true },
    { where: [state, "laws.city IN ($2)"], saved: false },
    { where: [state, "laws.county ILIKE $2 ESCAPE '\\'"], saved: false },
    { where: [state, `laws."function" = $2`], saved: false },
    { where: [state, "laws.topic = $2"], saved: false },
    { where: [state, "laws.is_substantive = $2"], saved: false },
    { where: [state, "laws.opacity >= $2"], saved: false },
    { where: [state, "laws.paternalism <= $2"], saved: false },
    { where: [state, "laws.source_jurisdiction_type = $2"], saved: false },
    {
      where: [
        state,
        "EXISTS (SELECT 1 FROM law_fines lf WHERE lf.law_id = laws.id AND lf.effective_max IS NOT NULL)",
      ],
      saved: false,
    },
    { where: [state], rows: [state, "lfs.effective_max IS NOT NULL"], saved: false },
  ];
  for (const c of cases) {
    assert.equal(shouldUseSavedScopeTotal(c.where, c.rows), c.saved, c.where.join(" | "));
  }
});

test("hasPenaltyFilter ignores absent, false and malformed values", () => {
  assert.equal(hasPenaltyFilter(fromQs()), false);
  assert.equal(hasPenaltyFilter(fromQs("state=co")), false);
  assert.equal(hasPenaltyFilter(fromQs("hasFine=false")), false);
  assert.equal(hasPenaltyFilter(fromQs("jail=1")), false);
  assert.equal(hasPenaltyFilter(fromQs("perDay=")), false);
  assert.equal(hasPenaltyFilter({ page: 1, pageSize: 25, hasFine: false }), false);
  assert.equal(hasPenaltyFilter(fromQs("fineMin=abc")), false);
  assert.equal(hasPenaltyFilter(fromQs("fineMin=")), false);
  assert.equal(hasPenaltyFilter(fromQs("fineMin=0")), true);
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
