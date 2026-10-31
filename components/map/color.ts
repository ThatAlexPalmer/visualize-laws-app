import {
  amountShare,
  type Axis,
  type AxisAverages,
  type MapLayer,
  type PenaltyStats,
} from "@/lib/types";

/**
 * Per-axis HSL ramp params. Keeping hue constant while sweeping lightness
 * 4%→56% gives the widest perceptual gradient on a black background —
 * the same principle as the original white-opacity ramp but in full color.
 */
interface AxisHSL {
  hue: number;
  satLow: number;
  satHigh: number;
  litLow: number;
  litHigh: number;
}
const AXIS_HSL: Record<Axis, AxisHSL> = {
  opacity:               { hue: 4,   satLow: 60, satHigh: 88, litLow: 4, litHigh: 56 }, // red
  enforcementDiscretion: { hue: 217, satLow: 65, satHigh: 90, litLow: 4, litHigh: 58 }, // blue
  paternalism:           { hue: 22,  satLow: 65, satHigh: 93, litLow: 4, litHigh: 53 }, // orange
  problemSalience:       { hue: 258, satLow: 60, satHigh: 83, litLow: 4, litHigh: 60 }, // purple
};

/** Maps each axis to the aggregate's average column. */
export const AXIS_TO_AVG: Record<Axis, keyof AxisAverages> = {
  opacity: "avgOpacity",
  enforcementDiscretion: "avgEnforcementDiscretion",
  paternalism: "avgPaternalism",
  problemSalience: "avgProblemSalience",
};

/** The average value of a jurisdiction aggregate along the given axis. */
export function axisValue(agg: AxisAverages, axis: Axis): number {
  return agg[AXIS_TO_AVG[axis]];
}

export interface Domain {
  min: number;
  max: number;
}

/**
 * Color-scale domain from the rows on screen. A single finite value
 * (one county, or identical averages) expands around that value so
 * normalize() lands at 0.5 — mid-ramp fill instead of no paint.
 * Returns null only when there is no finite value.
 */
export function computeDomain(axis: Axis, rows: AxisAverages[]): Domain | null {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const v = axisValue(r, axis);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // One joined county (or identical avgs): pad so the fill is mid-ramp, not empty.
  if (max <= min) return { min: min - 1, max: min + 1 };
  return { min, max };
}

/** Clamp a value to [0,1] within the given domain. */
export function normalize(value: number, domain: Domain): number {
  const t = (value - domain.min) / (domain.max - domain.min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Axis-aware choropleth fill: sweeps lightness 4%→56% at a fixed hue,
 * producing a wide, readable gradient on a black background.
 */
export function rampColorForAxis(t: number, axis: Axis): string {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const p = AXIS_HSL[axis];
  const sat = p.satLow + (p.satHigh - p.satLow) * clamped;
  const lit = p.litLow + (p.litHigh - p.litLow) * clamped;
  return `hsl(${p.hue},${sat.toFixed(1)}%,${lit.toFixed(1)}%)`;
}

// --- Penalties layer -------------------------------------------------------

/** Hue ~160, clear of every axis hue so the layer reads as its own thing. */
const PENALTY_HSL: AxisHSL = {
  hue: 160,
  satLow: 55,
  satHigh: 84,
  litLow: 4,
  litHigh: 52,
};

export function rampColorForPenalties(t: number): string {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const p = PENALTY_HSL;
  const sat = p.satLow + (p.satHigh - p.satLow) * clamped;
  const lit = p.litLow + (p.litHigh - p.litLow) * clamped;
  return `hsl(${p.hue},${sat.toFixed(1)}%,${lit.toFixed(1)}%)`;
}

/** A row that either layer can paint. */
export type LayerRow = AxisAverages & { penalties?: PenaltyStats | null };

/**
 * The value a row contributes under the active layer, or null when it cannot
 * be painted. Null is meaningful for penalties: the place was never annotated,
 * which is not the same as stating no amount.
 */
export function layerValue(
  row: LayerRow,
  layer: MapLayer,
  axis: Axis,
): number | null {
  if (layer === "penalties") return amountShare(row.penalties);
  return axisValue(row, axis);
}

/**
 * Domain for the active layer, from the rows on screen. National slider
 * bounds are not a color scale. Penalties are a share, so a log or
 * percentile clamp is only a hazard for raw dollar amounts, which this
 * layer does not paint.
 */
export function computeLayerDomain(
  layer: MapLayer,
  axis: Axis,
  rows: LayerRow[],
): Domain | null {
  if (layer !== "penalties") return computeDomain(axis, rows);

  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const v = amountShare(r.penalties);
    if (v === null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) return { min: Math.max(0, min - 0.01), max: min + 0.01 };
  return { min, max };
}

/** Ramp colour for the active layer at position `t`. */
export function rampColorForLayer(
  t: number,
  layer: MapLayer,
  axis: Axis,
): string {
  return layer === "penalties"
    ? rampColorForPenalties(t)
    : rampColorForAxis(t, axis);
}
