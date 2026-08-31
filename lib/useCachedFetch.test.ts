import assert from "node:assert/strict";
import { test } from "node:test";

import { heldForKey, statusForKey } from "./useCachedFetch";

test("heldForKey drops a previous key on miss so TX cannot render as CA", () => {
  const texas = { name: "Texas" };
  const california = { name: "California" };
  const cache = new Map<string, { name: string }>([["tx", texas]]);
  const heldTx = { key: "tx", value: texas };

  assert.equal(heldForKey(heldTx, "ca", cache), null);
  assert.equal(heldForKey(heldTx, null, cache), null);

  const hit = heldForKey(heldTx, "tx", cache);
  assert.equal(hit?.key, "tx");
  assert.equal(hit?.value, texas);

  cache.set("ca", california);
  const fromCache = heldForKey(heldTx, "ca", cache);
  assert.equal(fromCache?.key, "ca");
  assert.equal(fromCache?.value, california);
});

test("heldForKey on error-shaped miss stays empty until the current key is stored", () => {
  const texas = { name: "Texas" };
  const cache = new Map<string, { name: string }>([["tx", texas]]);
  assert.equal(heldForKey({ key: "tx", value: texas }, "ca", cache), null);
  assert.equal(heldForKey(null, "ca", cache), null);
});

test("statusForKey does not keep TX ready when the key is CA", () => {
  const texas = { key: "tx", value: { name: "Texas" } };
  assert.equal(statusForKey("ca", null, null), "loading");
  assert.equal(statusForKey("ca", texas, null), "loading");
  assert.equal(statusForKey("ca", null, "ca"), "error");
  assert.equal(statusForKey("tx", texas, null), "ready");
  assert.equal(statusForKey(null, texas, "tx"), "idle");
});
