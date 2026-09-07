import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@/data/db";
import { queryLaws } from "@/data/queries/laws";
import { GET } from "@/app/api/laws/route";
import type { LawSummary } from "@/data/types";

import {
  searchParamsToFilters,
  shouldUseSavedScopeTotal,
} from "@/data/filters";
import { isSortKey } from "@/data/types";

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

const law: LawSummary = {
  id: 1, header: "Parking", state: "co", city: "pagosa_springs", county: null,
  isSubstantive: true, function: "Rules", topic: "Other", sourceJurisdictionType: "cities",
  opacity: 0, enforcementDiscretion: 0, paternalism: 0, problemSalience: 0, fine: 500,
};

function fixture(t: TestContext, options: {
  size?: number; estimate?: unknown; saved?: number | null; failRows?: boolean;
  failEstimate?: boolean; catalog?: number | null;
} = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let savedCalls = 0;
  const overrides = {
    jurisdiction: { findFirst: async () => {
      savedCalls++;
      return options.saved == null ? null : { lawCount: options.saved };
    } },
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("EXPLAIN")) {
        if (options.failEstimate) throw new Error("estimate unavailable");
        return [{ "QUERY PLAN": [{ Plan: { "Plan Rows": options.estimate ?? 1 } }] }];
      }
      if (sql.includes("reltuples")) return [{ total: options.catalog ?? null }];
      if (options.failRows) throw new Error("rows unavailable");
      return Array.from({ length: options.size ?? 9 }, (_, i) => ({ ...law, id: i + 1 }));
    },
  };
  // Prisma delegates are proxy-backed; restore each override after the test.
  for (const [key, value] of Object.entries(overrides)) {
    const original = Reflect.get(prisma, key);
    Reflect.set(prisma, key, value);
    t.after(() => { Reflect.set(prisma, key, original); });
  }
  return { calls, savedCalls: () => savedCalls };
}

const filtered = (page = 1) => ({ page, pageSize: 8, state: "co", city: "pagosa_springs" });

test("underestimated totals cannot hide lookahead or change the returned page size", async (t) => {
  const { calls } = fixture(t);
  const result = await queryLaws(filtered(4));
  assert.deepEqual(result.rows.map(r => r.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.totalKind, "estimated");
  assert.equal(result.total, 33);
  const rows = calls.find(c => c.sql.includes("LIMIT"))!;
  assert.deepEqual(rows.params, ["co", "pagosa_springs", 9, 24]);
  assert.match(rows.sql, /ORDER BY laws.id ASC/);
  assert.ok(calls.every(c => !/count\(\*\)/i.test(c.sql)));
});

for (const size of [0, 3, 8]) {
  test(`terminal first page with ${size} rows is exact despite a high estimate`, async (t) => {
    fixture(t, { size, estimate: 50000 });
    const result = await queryLaws(filtered());
    assert.equal(result.hasNextPage, false);
    assert.equal(result.totalKind, "exact");
    assert.equal(result.total, size);
  });
}

test("terminal later full page proves its total even if estimation fails", async (t) => {
  fixture(t, { size: 8, failEstimate: true });
  const result = await queryLaws(filtered(3));
  assert.equal(result.hasNextPage, false);
  assert.equal(result.totalKind, "exact");
  assert.equal(result.total, 24);
});

for (const estimate of [-1, NaN, Infinity, "12", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid estimate ${String(estimate)} is unavailable, not an exact total`, async (t) => {
    fixture(t, { estimate });
    const result = await queryLaws(filtered());
    assert.equal(result.hasNextPage, true);
    assert.equal(result.totalKind, "unavailable");
    assert.equal(result.total, null);
  });
}

test("failed estimation leaves continuation usable", async (t) => {
  fixture(t, { failEstimate: true });
  const result = await queryLaws(filtered());
  assert.equal(result.hasNextPage, true);
  assert.equal(result.totalKind, "unavailable");
  assert.equal(result.total, null);
});

test("an empty out-of-range page must not invent a count from its offset", async (t) => {
  fixture(t, { size: 0, estimate: 10 });
  const result = await queryLaws(filtered(100));
  assert.equal(result.hasNextPage, false);
  assert.equal(result.totalKind, "estimated");
  assert.equal(result.total, 10);
});

test("empty out-of-range page with no estimate has no total", async (t) => {
  fixture(t, { size: 0, failEstimate: true });
  assert.deepEqual(await queryLaws(filtered(100)), {
    rows: [], page: 100, pageSize: 8, total: null, totalKind: "unavailable", hasNextPage: false,
  });
});

test("saved scope counts stay exact when consistent with the current rows", async (t) => {
  const stub = fixture(t, { saved: 100 });
  const result = await queryLaws({ page: 1, pageSize: 8, state: "co" });
  assert.equal(result.totalKind, "exact");
  assert.equal(result.total, 100);
  assert.equal(result.hasNextPage, true);
  assert.equal(stub.savedCalls(), 1);
  assert.equal(stub.calls.length, 1);
});

test("saved count below lookahead cannot disable continuation or claim precision", async (t) => {
  fixture(t, { saved: 8 });
  const result = await queryLaws({ page: 1, pageSize: 8 });
  assert.equal(result.hasNextPage, true);
  assert.equal(result.totalKind, "unavailable");
});

test("saved overcount is superseded by a terminal page", async (t) => {
  fixture(t, { saved: 100, size: 3 });
  const result = await queryLaws({ page: 2, pageSize: 8 });
  assert.equal(result.totalKind, "exact");
  assert.equal(result.total, 11);
});

test("missing saved scope falls back to a labelled catalog estimate", async (t) => {
  fixture(t, { catalog: 500 });
  const result = await queryLaws({ page: 1, pageSize: 8 });
  assert.equal(result.totalKind, "estimated");
  assert.equal(result.total, 500);
});

for (const dir of ["asc", "desc"] as const) {
  test(`fine ${dir} lookahead shares every bound predicate and stable sort`, async (t) => {
    const stub = fixture(t);
    await queryLaws({ ...filtered(), sort: { key: "fine", dir },
      hasFine: true, jail: true, fineMin: 100, fineMax: 500 });
    assert.equal(stub.savedCalls(), 0);
    const rows = stub.calls.find(c => c.sql.includes("LIMIT"))!;
    const estimate = stub.calls.find(c => c.sql.startsWith("EXPLAIN"))!;
    assert.deepEqual(rows.params, [...estimate.params, 9, 0]);
    assert.deepEqual(estimate.params, ["co", "pagosa_springs", 100, 500]);
    for (const { sql } of [rows, estimate]) {
      assert.match(sql, /laws LEFT JOIN law_fines lfs ON lfs.law_id = laws.id/);
      assert.match(sql, /lfs.effective_max IS NOT NULL/);
      assert.match(sql, /lf.jail_mentioned/);
      assert.match(sql, /lf.effective_max >= \$3/);
      assert.match(sql, /lf.effective_min <= \$4/);
    }
    assert.match(rows.sql, new RegExp(`ORDER BY lfs.effective_max ${dir.toUpperCase()}, laws.id ASC`));
  });
}

test("HTTP response includes precision and continuation and keeps the size cap", async (t) => {
  const { calls } = fixture(t, { size: 101 });
  const response = await GET(new Request("http://localhost/api/laws?city=pagosa_springs&pageSize=1000"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.rows.length, 100);
  assert.equal(result.pageSize, 100);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.totalKind, "estimated");
  assert.deepEqual(calls.find(c => c.sql.includes("LIMIT"))!.params.slice(-2), [101, 0]);
});

test("row query failures still return 503, not a count-only success", async (t) => {
  fixture(t, { failRows: true });
  t.mock.method(console, "error", () => {});
  const response = await GET(new Request("http://localhost/api/laws?city=pagosa_springs"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Law results are temporarily unavailable." });
});
