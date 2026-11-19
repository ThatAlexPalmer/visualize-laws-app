import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@/data/db";
import { queryLaws } from "@/data/queries/laws";
import { GET } from "@/app/api/laws/route";
import type { LawSummary } from "@/data/types";

import { searchParamsToFilters } from "@/data/filters";

const law: LawSummary = {
  id: 1, header: "Parking", state: "co", city: "pagosa_springs", county: null,
  isSubstantive: true, function: "Rules", topic: "Other", sourceJurisdictionType: "cities",
  opacity: 0, enforcementDiscretion: 0, paternalism: 0, problemSalience: 0, fine: 500,
};

function fixture(t: TestContext, options: {
  size?: number; estimate?: unknown; saved?: number | null; failRows?: boolean;
  failEstimate?: boolean; catalog?: number | null; omitFine?: boolean;
} = {}) {
  const calls: { sql: string }[] = [];
  const overrides = {
    jurisdiction: { findFirst: async () => (
      options.saved == null ? null : { lawCount: options.saved }
    ) },
    $queryRawUnsafe: async (sql: string) => {
      calls.push({ sql });
      if (sql.startsWith("EXPLAIN")) {
        if (options.failEstimate) throw new Error("estimate unavailable");
        return [{ "QUERY PLAN": [{ Plan: { "Plan Rows": options.estimate ?? 1 } }] }];
      }
      if (sql.includes("reltuples")) return [{ total: options.catalog ?? null }];
      if (options.failRows) throw new Error("rows unavailable");
      return Array.from({ length: options.size ?? 9 }, (_, i) => {
        const row = { ...law, id: i + 1 };
        if (options.omitFine) delete (row as { fine?: number | null }).fine;
        return row;
      });
    },
  };
  for (const [key, value] of Object.entries(overrides)) {
    const original = Reflect.get(prisma, key);
    Reflect.set(prisma, key, value);
    t.after(() => { Reflect.set(prisma, key, original); });
  }
  return { calls };
}

const filtered = (page = 1) => ({ page, pageSize: 8, state: "co", city: "pagosa_springs" });

test("a state total is the saved count; a fine sort or penalty filter is not", async (t) => {
  fixture(t, { saved: 100 });
  const stateOnly = await queryLaws(
    searchParamsToFilters(new URLSearchParams("state=co&pageSize=8")),
  );
  assert.equal(stateOnly.total, 100);
  assert.equal(stateOnly.totalKind, "exact");
  assert.equal(stateOnly.hasNextPage, true);

  const fineSort = await queryLaws(
    searchParamsToFilters(new URLSearchParams("state=co&pageSize=8&sort=fine&dir=desc")),
  );
  assert.equal(fineSort.totalKind, "estimated");
  assert.equal(fineSort.total, 9);
  assert.equal(fineSort.hasNextPage, true);

  const penalty = await queryLaws(
    searchParamsToFilters(new URLSearchParams("state=co&pageSize=8&hasFine=true")),
  );
  assert.equal(penalty.totalKind, "estimated");
  assert.equal(penalty.hasNextPage, true);
});

test("a short estimate cannot hide the next page or shrink the page", async (t) => {
  const { calls } = fixture(t);
  const result = await queryLaws(filtered(4));
  assert.deepEqual(result.rows.map((row) => row.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.totalKind, "estimated");
  assert.equal(result.total, 33);
  assert.ok(calls.every((call) => !/count\(\*\)/i.test(call.sql)));
});

test("a finished first page is an exact total", async (t) => {
  const options = { size: 0, estimate: 50000 };
  fixture(t, options);
  const empty = await queryLaws(filtered());
  assert.equal(empty.hasNextPage, false);
  assert.equal(empty.totalKind, "exact");
  assert.equal(empty.total, 0);

  options.size = 8;
  const full = await queryLaws(filtered());
  assert.equal(full.hasNextPage, false);
  assert.equal(full.totalKind, "exact");
  assert.equal(full.total, 8);
});

test("a finished later page is an exact total even when the estimate fails", async (t) => {
  fixture(t, { size: 8, failEstimate: true });
  const result = await queryLaws(filtered(3));
  assert.equal(result.hasNextPage, false);
  assert.equal(result.totalKind, "exact");
  assert.equal(result.total, 24);
});

test("a bad or failed estimate stays unavailable and still allows the next page", async (t) => {
  const options: { estimate?: unknown; failEstimate?: boolean } = { estimate: 1.5 };
  fixture(t, options);
  const fractional = await queryLaws(filtered());
  assert.equal(fractional.hasNextPage, true);
  assert.equal(fractional.totalKind, "unavailable");
  assert.equal(fractional.total, null);

  options.failEstimate = true;
  const failed = await queryLaws(filtered());
  assert.equal(failed.hasNextPage, true);
  assert.equal(failed.totalKind, "unavailable");
  assert.equal(failed.total, null);
});

test("an empty later page does not invent a total from its offset", async (t) => {
  const options: { size: number; estimate?: unknown; failEstimate?: boolean } = {
    size: 0,
    estimate: 10,
  };
  fixture(t, options);
  const estimated = await queryLaws(filtered(100));
  assert.equal(estimated.hasNextPage, false);
  assert.equal(estimated.totalKind, "estimated");
  assert.equal(estimated.total, 10);

  options.failEstimate = true;
  assert.deepEqual(await queryLaws(filtered(100)), {
    rows: [], page: 100, pageSize: 8, total: null, totalKind: "unavailable", hasNextPage: false,
  });
});

test("every list row carries fine as number or null", async (t) => {
  fixture(t, { omitFine: true, size: 2, estimate: 2 });
  const result = await queryLaws({ page: 1, pageSize: 8, state: "co", city: "denver" });
  assert.equal(result.rows.length, 2);
  for (const row of result.rows) assert.equal(row.fine, null);
});

test("saved scope counts stay exact only when the rows agree", async (t) => {
  const options: { saved: number; size: number } = { saved: 100, size: 9 };
  fixture(t, options);
  const consistent = await queryLaws({ page: 1, pageSize: 8, state: "co" });
  assert.equal(consistent.totalKind, "exact");
  assert.equal(consistent.total, 100);
  assert.equal(consistent.hasNextPage, true);

  options.saved = 8;
  const short = await queryLaws({ page: 1, pageSize: 8 });
  assert.equal(short.hasNextPage, true);
  assert.equal(short.totalKind, "unavailable");
  assert.equal(short.total, null);

  options.saved = 100;
  options.size = 3;
  const terminal = await queryLaws({ page: 2, pageSize: 8 });
  assert.equal(terminal.totalKind, "exact");
  assert.equal(terminal.total, 11);
});

test("a missing saved count falls back to a labelled catalog estimate", async (t) => {
  fixture(t, { catalog: 500 });
  const result = await queryLaws({ page: 1, pageSize: 8 });
  assert.equal(result.totalKind, "estimated");
  assert.equal(result.total, 500);
});

test("the laws endpoint caps page size and returns 503 when the rows fail", async (t) => {
  const options = { size: 101, failRows: false };
  fixture(t, options);
  const ok = await GET(new Request("http://localhost/api/laws?city=pagosa_springs&pageSize=1000"));
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.rows.length, 100);
  assert.equal(body.pageSize, 100);
  assert.equal(body.hasNextPage, true);
  assert.equal(body.totalKind, "estimated");

  options.failRows = true;
  t.mock.method(console, "error", () => {});
  const failed = await GET(new Request("http://localhost/api/laws?city=pagosa_springs"));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "Law results are temporarily unavailable." });
});
