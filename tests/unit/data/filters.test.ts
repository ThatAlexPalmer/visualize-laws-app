import assert from "node:assert/strict";
import { test } from "node:test";

import { filtersToSearchParams, searchParamsToFilters } from "@/data/filters";
import type { LawFilters } from "@/data/types";

function fromQs(qs = ""): LawFilters {
  return searchParamsToFilters(new URLSearchParams(qs));
}

test("law filters round-trip through the query string", () => {
  const original: LawFilters = {
    q: "water",
    state: "co",
    city: "denver",
    county: "el_paso",
    function: "Zoning",
    topic: "Animals",
    isSubstantive: false,
    opacity: { min: -0.5, max: 1.25 },
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
    sort: { key: "fine", dir: "asc" },
  };
  const params = filtersToSearchParams(original);
  assert.equal(params.get("isSubstantive"), "false");
  assert.equal(params.get("hasFine"), "true");
  assert.equal(params.get("fineMin"), "0");
  assert.equal(params.get("opacityMin"), "-0.5");
  assert.equal(params.get("sort"), "fine");
  assert.equal(params.get("dir"), "asc");
  assert.deepEqual(searchParamsToFilters(params), original);

  const off = filtersToSearchParams({
    page: 1,
    pageSize: 25,
    hasFine: false,
    perDay: false,
    jail: false,
    sort: null,
  });
  assert.equal(off.get("hasFine"), null);
  assert.equal(off.get("sort"), null);
  assert.deepEqual(fromQs(), { page: 1, pageSize: 25 });
});

test("malformed query values do not become filters", () => {
  assert.equal(fromQs("sort=fine; DROP&dir=desc").sort, undefined);
  assert.equal(fromQs("sort=constructor").sort, undefined);
  assert.equal(fromQs("sort=__proto__").sort, undefined);
  assert.equal(fromQs("penaltyNature=CRIMINAL").penaltyNature, undefined);
  assert.equal(fromQs("penaltyNature=' OR 1=1--").penaltyNature, undefined);
  assert.equal(fromQs("hasFine=false").hasFine, undefined);
  assert.equal(fromQs("jail=1").jail, undefined);
  assert.equal(fromQs("fineMin=abc").fineMin, undefined);
  assert.equal(fromQs("fineMin=0").fineMin, 0);
  assert.equal(fromQs("penaltyNature=civil").penaltyNature, "civil");

  for (const page of ["Infinity", "NaN", "1.5", "9007199254740991"]) {
    const parsed = fromQs(`page=${page}&pageSize=100`);
    assert.equal(parsed.page, 1);
    assert.ok(Number.isSafeInteger((parsed.page - 1) * parsed.pageSize));
  }
  assert.equal(fromQs("pageSize=Infinity").pageSize, 25);
  assert.equal(fromQs("pageSize=101").pageSize, 100);
});
