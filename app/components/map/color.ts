import type { Axis, AxisBounds, JurisdictionAgg } from "@/lib/types";

/** Maps each axis to the aggregate's average column on a JurisdictionAgg. */
export const AXIS_TO_AVG: Record<Axis, keyof JurisdictionAgg> = {
  opacity: "avgOpacity",
  enforcementDiscretion: "avgEnforcementDiscretion",
  paternalism: "avgPaternalism",
  problemSalience: "avgProblemSalience",
};

/** The average value of a jurisdiction aggregate along the given axis. */
export function axisValue(agg: JurisdictionAgg, axis: Axis): number {
  return agg[AXIS_TO_AVG[axis]] as number;
}

export interface Domain {
  min: number;
  max: number;
}

/**
 * Pick a color-scale domain for an axis. Prefers the national per-axis bounds
 * (so all axes share a stable scale); falls back to the min/max across the
 * supplied state rows, and returns null when there is nothing to scale.
 */
export function computeDomain(
  axis: Axis,
  rows: JurisdictionAgg[],
  bounds?: AxisBounds,
): Domain | null {
  const b = bounds?.[axis];
  if (
    Array.isArray(b) &&
    Number.isFinite(b[0]) &&
    Number.isFinite(b[1]) &&
    b[1] > b[0]
  ) {
    return { min: b[0], max: b[1] };
  }

  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const v = axisValue(r, axis);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return { min, max };
}

/** Clamp a value to [0,1] within the given domain. */
export function normalize(value: number, domain: Domain): number {
  const t = (value - domain.min) / (domain.max - domain.min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Monochrome (white-on-black) ramp bounds, expressed as alpha on pure white.
const MIN_ALPHA = 0.06;
const MAX_ALPHA = 0.92;

/** White at an opacity mapped from t in [0,1] — the choropleth fill color. */
export function rampColor(t: number): string {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * clamped;
  return `rgba(255,255,255,${alpha.toFixed(3)})`;
}
