import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldUseSavedScopeTotal } from "./laws";

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
