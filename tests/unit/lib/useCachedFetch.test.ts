import assert from "node:assert/strict";
import { test } from "node:test";

import { heldForKey, statusForKey } from "@/lib/useCachedFetch";

test("a cached state is not shown for a different state", () => {
  const texas = { name: "Texas" };
  const california = { name: "California" };
  const cache = new Map<string, { name: string }>([["tx", texas]]);
  const heldTx = { key: "tx", value: texas };

  assert.equal(heldForKey(heldTx, "ca", cache), null);
  assert.equal(heldForKey(heldTx, null, cache), null);
  assert.equal(heldForKey(null, "ca", cache), null);
  assert.equal(heldForKey(heldTx, "tx", cache)?.value, texas);

  cache.set("ca", california);
  assert.equal(heldForKey(heldTx, "ca", cache)?.value, california);

  assert.equal(statusForKey("ca", null, null), "loading");
  assert.equal(statusForKey("ca", heldTx, null), "loading");
  assert.equal(statusForKey("ca", null, "ca"), "error");
  assert.equal(statusForKey("tx", heldTx, null), "ready");
  assert.equal(statusForKey(null, heldTx, "tx"), "idle");
});
