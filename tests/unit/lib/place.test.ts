import assert from "node:assert/strict";
import { test } from "node:test";

import { countyDetailRequest } from "@/lib/place";
import type { PlaceFocus } from "@/lib/types";

test("a county focus loads immediately, and typed text waits for the county list", () => {
  const focus: PlaceFocus = { kind: "county", state: "co", county: "el_paso_county" };
  assert.deepEqual(
    countyDetailRequest({
      selectedState: "co",
      selectedCounty: "el_paso_county",
      focus,
      counties: null,
    }),
    { slug: "el_paso_county", awaiting: false },
  );

  assert.deepEqual(
    countyDetailRequest({
      selectedState: "co",
      selectedCounty: "el",
      focus: { kind: "state", state: "co" },
      counties: null,
    }),
    { slug: null, awaiting: true },
  );

  assert.deepEqual(
    countyDetailRequest({
      selectedState: "co",
      selectedCounty: "El Paso",
      focus: { kind: "state", state: "co" },
      counties: [{ county: "el_paso_county" }],
    }),
    { slug: "el_paso_county", awaiting: false },
  );

  assert.deepEqual(
    countyDetailRequest({
      selectedState: "tx",
      selectedCounty: "el",
      focus: { kind: "state", state: "tx" },
      counties: [],
    }),
    { slug: null, awaiting: false },
  );
});
