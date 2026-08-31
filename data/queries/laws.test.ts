import assert from "node:assert/strict";
import { test } from "node:test";

import {
  searchParamsToFilters,
  shouldUseSavedScopeTotal,
} from "../filters";
import { isSortKey } from "../types";

test("isSortKey accepts the four axes plus fine, and nothing else", () => {
  for (const key of [
    "opacity",
    "enforcementDiscretion",
    "paternalism",
    "problemSalience",
    "fine",
  ]) {
    assert.equal(isSortKey(key), true, key);
  }
  // Anything else is dropped rather than interpolated into ORDER BY.
  for (const key of ["content", "id", "effective_max", "", "fine; DROP"]) {
    assert.equal(isSortKey(key), false, key);
  }
});

test("queryLaws saved-scope total follows LawFilters, not raw params", () => {
  const stateOnly = searchParamsToFilters(new URLSearchParams("state=co"));
  assert.equal(shouldUseSavedScopeTotal(stateOnly), true);

  const fineSort = searchParamsToFilters(
    new URLSearchParams("state=co&sort=fine&dir=desc"),
  );
  assert.equal(fineSort.sort?.key, "fine");
  assert.equal(shouldUseSavedScopeTotal(fineSort), false);

  const penalty = searchParamsToFilters(
    new URLSearchParams("state=co&hasFine=true"),
  );
  assert.equal(penalty.hasFine, true);
  assert.equal(shouldUseSavedScopeTotal(penalty), false);
});
