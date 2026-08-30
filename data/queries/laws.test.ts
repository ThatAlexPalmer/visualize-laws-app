import assert from "node:assert/strict";
import { test } from "node:test";

import { hasPenaltyFilter, shouldUseSavedScopeTotal } from "./laws";

test("shouldUseSavedScopeTotal: US and state-only reuse the saved total", () => {
  assert.equal(shouldUseSavedScopeTotal(new URLSearchParams()), true);
  assert.equal(shouldUseSavedScopeTotal(new URLSearchParams("state=co")), true);
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&page=2&pageSize=8")),
    true,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&sort=opacity&dir=desc")),
    true,
  );
});

test("shouldUseSavedScopeTotal: extra filters keep their own count", () => {
  assert.equal(shouldUseSavedScopeTotal(new URLSearchParams("state=co&q=water")), false);
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&city=denver")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&county=denver")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&function=zoning")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&topic=animals")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&isSubstantive=true")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&opacityMin=0")),
    false,
  );
  assert.equal(
    shouldUseSavedScopeTotal(new URLSearchParams("state=co&paternalismMax=1")),
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
    assert.equal(shouldUseSavedScopeTotal(new URLSearchParams(qs)), false, qs);
  }
});

test("hasPenaltyFilter ignores absent, false and malformed values", () => {
  assert.equal(hasPenaltyFilter(new URLSearchParams()), false);
  assert.equal(hasPenaltyFilter(new URLSearchParams("state=co")), false);
  // Only the literal "true" turns a boolean filter on.
  assert.equal(hasPenaltyFilter(new URLSearchParams("hasFine=false")), false);
  assert.equal(hasPenaltyFilter(new URLSearchParams("jail=1")), false);
  assert.equal(hasPenaltyFilter(new URLSearchParams("perDay=")), false);
  // Non-numeric bounds are not a filter.
  assert.equal(hasPenaltyFilter(new URLSearchParams("fineMin=abc")), false);
  assert.equal(hasPenaltyFilter(new URLSearchParams("fineMin=")), false);
  // 0 is a real lower bound and must count.
  assert.equal(hasPenaltyFilter(new URLSearchParams("fineMin=0")), true);
});

test("penaltyNature is whitelisted against the source vocabulary", () => {
  for (const nature of ["criminal", "civil", "both"]) {
    assert.equal(
      hasPenaltyFilter(new URLSearchParams(`penaltyNature=${nature}`)),
      true,
      nature,
    );
  }
  // Anything outside the vocabulary is dropped rather than reaching SQL.
  assert.equal(
    hasPenaltyFilter(new URLSearchParams("penaltyNature=CRIMINAL")),
    false,
  );
  assert.equal(
    hasPenaltyFilter(new URLSearchParams("penaltyNature=' OR 1=1--")),
    false,
  );
});
