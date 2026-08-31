import assert from "node:assert/strict";
import { test } from "node:test";

import { cityExactSql } from "../../data/queries/laws";
import { matchStateQuery } from "./placeLookup";

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
