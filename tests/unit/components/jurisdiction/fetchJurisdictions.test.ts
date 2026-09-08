import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchJurisdictions } from "@/components/jurisdiction/fetchJurisdictions";
import type { JurisdictionAgg } from "@/data/types";

const state: JurisdictionAgg = {
  level: "state",
  state: "co",
  county: null,
  name: "Colorado",
  lawCount: 12,
  substantiveCount: 12,
  avgOpacity: 1,
  avgEnforcementDiscretion: 2,
  avgPaternalism: 0,
  avgProblemSalience: 1,
  penalties: null,
};

test("incomplete national is an error, not a ready payload", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ rows: [state], national: null }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    await assert.rejects(
      fetchJurisdictions(new AbortController().signal),
      /incomplete/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("a complete national payload is returned", async () => {
  const original = globalThis.fetch;
  const body = {
    rows: [state],
    national: { ...state, level: "national", state: null, name: "United States" },
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  try {
    const result = await fetchJurisdictions(new AbortController().signal);
    assert.equal(result.national?.name, "United States");
    assert.equal(result.rows.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
