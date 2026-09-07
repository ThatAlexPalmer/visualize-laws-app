import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countySlugSearchVariants,
  parseAxisBounds,
} from "./jurisdictions";

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
