import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "@/data/db";

import {
  countySlugSearchVariants,
  getJurisdictions,
  getJurisdictionDetail,
  parseAxisBounds,
} from "@/data/queries/jurisdictions";

// Prisma delegates are proxy-backed, so node:test cannot mock their descriptors.
function stubPrisma(t: TestContext, overrides: Record<string, unknown>) {
  for (const [key, value] of Object.entries(overrides)) {
    const original = Reflect.get(prisma, key);
    Reflect.set(prisma, key, value);
    t.after(() => { Reflect.set(prisma, key, original); });
  }
}

test("countySlugSearchVariants SQL-narrows with slug forms, not the full table", () => {
  assert.deepEqual(countySlugSearchVariants("El Paso"), [
    "el_paso",
    "elpaso",
  ]);
  assert.deepEqual(countySlugSearchVariants("pagosa_springs"), [
    "pagosa_springs",
  ]);
});

test("parseAxisBounds requires four finite [min,max] pairs", () => {
  assert.equal(parseAxisBounds(null), undefined);
  assert.equal(parseAxisBounds({ opacity: [0, 1] }), undefined);
  const bounds = parseAxisBounds({
    opacity: [-1, 1],
    enforcementDiscretion: [-2, 2],
    paternalism: [-3, 3],
    problemSalience: [-4, 4],
  });
  assert.deepEqual(bounds?.opacity, [-1, 1]);
  assert.deepEqual(bounds?.problemSalience, [-4, 4]);
});

test("core aggregate failures propagate instead of returning empty success", async (t) => {
  t.mock.method(console, "error", () => {});
  stubPrisma(t, {
    jurisdiction: {
      findMany: async () => { throw new Error("core unavailable"); },
      findFirst: async () => null,
    },
    placePenalty: { findMany: async () => [] },
  });
  await assert.rejects(getJurisdictions(), /core unavailable/);
  await assert.rejects(getJurisdictionDetail("co"), /core unavailable/);
});

test("optional penalty and fill failures preserve core state and county data", async (t) => {
  t.mock.method(console, "error", () => {});
  const aggregate = {
    level: "state", state: "co", county: null, name: "Colorado", lawCount: 12,
    substantiveCount: 12, avgOpacity: 1, avgEnforcementDiscretion: 2,
    avgPaternalism: 0, avgProblemSalience: 1,
  };
  const county = { ...aggregate, level: "county", county: "denver", name: "Denver" };
  const unavailable = () => { throw new Error("optional unavailable"); };
  stubPrisma(t, {
    jurisdiction: { findMany: async () => [county], findFirst: async () => aggregate },
    law: { findMany: async () => [] },
    $queryRaw: async () => [],
    placePenalty: { findMany: unavailable, findFirst: unavailable },
    countyFill: { findMany: unavailable },
  });
  const detail = await getJurisdictionDetail("co");
  assert.equal(detail.jurisdiction?.name, "Colorado");
  assert.equal(detail.jurisdiction?.penalties, null);
  assert.equal(detail.countyFills[0].sourcePlace, "denver");
  assert.equal(detail.counties.length, 1);
  assert.equal((await getJurisdictions()).national?.penalties, null);
});
