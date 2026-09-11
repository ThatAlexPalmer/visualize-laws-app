import assert from "node:assert/strict";
import { test } from "node:test";

import { cityExactSql } from "@/data/queries/laws";
import {
  lookupPlaces,
  matchStateQuery,
  pickFromPlaces,
  pickPlace,
  queryWantsCounty,
  resolveQueryFocus,
} from "@/lib/placeLookup";
import type { PlaceMatch } from "@/lib/types";

test("matchStateQuery: exact name or USPS code, not a prefix", () => {
  assert.equal(matchStateQuery("colorado"), "co");
  assert.equal(matchStateQuery("Colorado"), "co");
  assert.equal(matchStateQuery("CO"), "co");
  assert.equal(matchStateQuery("co"), "co");
  assert.equal(matchStateQuery("New York"), "ny");
  assert.equal(matchStateQuery("district of columbia"), "dc");
  assert.equal(matchStateQuery("col"), null);
  assert.equal(matchStateQuery("colorado city"), null);
  assert.equal(matchStateQuery(""), null);
});

test("queryWantsCounty reads county/parish/borough tokens", () => {
  assert.equal(queryWantsCounty("El Paso County"), true);
  assert.equal(queryWantsCounty("orleans parish"), true);
  assert.equal(queryWantsCounty("Juneau Borough"), true);
  assert.equal(queryWantsCounty("El Paso"), false);
  assert.equal(queryWantsCounty("countyline"), false);
});

test("pickPlace prefers the current state, else the first (largest) row", () => {
  const rows: PlaceMatch[] = [
    { state: "tx", city: "springfield", name: "Springfield", lawCount: 40 },
    { state: "il", city: "springfield", name: "Springfield", lawCount: 10 },
  ];
  assert.equal(pickPlace(rows, "il")?.state, "il");
  assert.equal(pickPlace(rows, "co")?.state, "tx");
  assert.equal(pickPlace([], "il"), null);
});

test("pickFromPlaces: QuickSearch and Sidebar share ranking", () => {
  const denver: PlaceMatch = {
    state: "co",
    city: "denver",
    name: "Denver",
    lawCount: 20,
  };
  const elPaso: PlaceMatch = {
    state: "co",
    county: "el_paso_county",
    name: "El Paso",
    lawCount: 8,
  };
  const elPasoTx: PlaceMatch = {
    state: "tx",
    county: "el_paso_county",
    name: "El Paso",
    lawCount: 30,
  };

  assert.deepEqual(
    pickFromPlaces({
      query: "denver",
      currentState: null,
      uniqueOnly: true,
      cities: [denver],
      counties: [],
    }),
    { kind: "city", state: "co", city: "denver" },
  );

  assert.deepEqual(
    pickFromPlaces({
      query: "el paso",
      currentState: "co",
      uniqueOnly: true,
      prefer: "county",
      cities: [],
      counties: [elPasoTx, elPaso],
    }),
    { kind: "county", state: "co", county: "el_paso_county" },
  );

  assert.deepEqual(
    pickFromPlaces({
      query: "El Paso County",
      currentState: null,
      uniqueOnly: true,
      cities: [denver],
      counties: [elPaso],
    }),
    { kind: "county", state: "co", county: "el_paso_county" },
  );

  assert.equal(
    pickFromPlaces({
      query: "springfield",
      currentState: null,
      uniqueOnly: true,
      prefer: "city",
      cities: [],
      counties: [elPaso, elPasoTx],
    }),
    null,
  );

  assert.equal(
    pickFromPlaces({
      query: "nowhere",
      currentState: null,
      uniqueOnly: true,
      cities: [],
      counties: [],
    }),
    undefined,
  );
});

test("cityExactSql uses IN on slug variants, not ILIKE contains", () => {
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const colorado = cityExactSql("colorado", bind);
  assert.equal(colorado, "laws.city IN ($1)");
  assert.deepEqual(params, ["colorado"]);
  assert.equal(colorado.includes("%"), false);
  assert.equal(/ILIKE/i.test(colorado), false);

  params.length = 0;
  const springs = cityExactSql("Pagosa Springs", bind);
  assert.equal(springs, "laws.city IN ($1, $2)");
  assert.deepEqual(params, ["pagosa_springs", "pagosasprings"]);
  assert.equal(springs.includes("%"), false);
});

test("place predicates are table-qualified", () => {
  // The rows query LEFT JOINs law_fines, which has its own city/state/county
  // columns. An unqualified predicate is ambiguous and Postgres errors, so
  // every place filter would fail the route.
  const bind = (): string => "$1";
  assert.ok(cityExactSql("denver", bind).startsWith("laws.city"));
});

test("place lookup 200 with no rows is a real empty match", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ places: [] }), { status: 200 })) as typeof fetch;
  try {
    assert.deepEqual(await lookupPlaces("city", "zzzz"), []);
  } finally {
    globalThis.fetch = original;
  }
});

test("place lookup HTTP failures throw instead of looking like no match", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "down" }), { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(lookupPlaces("city", "denver"), /Place lookup failed with 503/);
  } finally {
    globalThis.fetch = original;
  }
});

test("resolveQueryFocus does not treat a lookup HTTP failure as no match", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "down" }), { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(
      resolveQueryFocus("denver", { currentState: null, uniqueOnly: false }),
      /Place lookup failed with 503/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
