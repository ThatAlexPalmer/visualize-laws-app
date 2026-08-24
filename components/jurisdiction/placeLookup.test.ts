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
  assert.equal(colorado, "city IN ($1)");
  assert.deepEqual(params, ["colorado"]);
  assert.equal(colorado.includes("%"), false);
  assert.equal(/ILIKE/i.test(colorado), false);

  params.length = 0;
  const springs = cityExactSql("Pagosa Springs", bind);
  assert.equal(springs, "city IN ($1, $2)");
  assert.deepEqual(params, ["pagosa_springs", "pagosasprings"]);
  assert.equal(springs.includes("%"), false);
});
