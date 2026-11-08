import assert from "node:assert/strict";
import { test } from "node:test";

import type { Axis } from "@/lib/types";

import { rampColorForLayer } from "@/components/map/color";

// Endpoint stops from the choropleth ramps. Callers (the legend gradient and
// the county fill) only see the hsl() string, so these are the contract.
const SCORE_ENDS: Record<Axis, [string, string]> = {
  opacity: ["hsl(4,60.0%,4.0%)", "hsl(4,88.0%,56.0%)"],
  enforcementDiscretion: ["hsl(217,65.0%,4.0%)", "hsl(217,90.0%,58.0%)"],
  paternalism: ["hsl(22,65.0%,4.0%)", "hsl(22,93.0%,53.0%)"],
  problemSalience: ["hsl(258,60.0%,4.0%)", "hsl(258,83.0%,60.0%)"],
};

test("score fills sweep each axis hue from its dark stop to its light stop", () => {
  for (const [axis, [low, high]] of Object.entries(SCORE_ENDS) as Array<
    [Axis, [string, string]]
  >) {
    assert.equal(rampColorForLayer(0, "scores", axis), low);
    assert.equal(rampColorForLayer(1, "scores", axis), high);
    assert.equal(rampColorForLayer(-2, "scores", axis), low);
    assert.equal(rampColorForLayer(3, "scores", axis), high);
  }
  assert.equal(
    rampColorForLayer(0.5, "scores", "opacity"),
    "hsl(4,74.0%,30.0%)",
  );
});

test("fine fills use their own hue, not the active score axis", () => {
  assert.equal(rampColorForLayer(0, "penalties", "opacity"), "hsl(160,55.0%,4.0%)");
  assert.equal(rampColorForLayer(1, "penalties", "paternalism"), "hsl(160,84.0%,52.0%)");
  assert.equal(rampColorForLayer(2, "penalties", "opacity"), "hsl(160,84.0%,52.0%)");
  assert.notEqual(
    rampColorForLayer(1, "penalties", "opacity"),
    rampColorForLayer(1, "scores", "opacity"),
  );
});
