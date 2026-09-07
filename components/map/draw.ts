import { geoPath } from "d3-geo";

import { theme } from "@/lib/theme";
import {
  normalizePlaceKey,
  type Axis,
  type CountyFill,
  type JurisdictionAgg,
  type MapLayer,
} from "@/lib/types";

import { boundsToBBox, type Camera, type WorldBBox } from "./camera";
import {
  layerValue,
  normalize,
  rampColorForLayer,
  type Domain,
} from "./color";
import type { CountyFeatureEntry, CountyFillPaint } from "./counties";
import { fipsToUsps } from "./fips";
import { stateFeatures, usProjection } from "./geo";

export interface Size {
  w: number;
  h: number;
  dpr: number;
}

export interface StatePathEntry {
  usps: string | null;
  path: Path2D;
  bbox: WorldBBox;
}

export interface CountyPathEntry {
  fips: string;
  stateFips: string;
  usps: string | null;
  name: string;
  path: Path2D;
  bbox: WorldBBox;
}

export interface Hovered {
  kind: "state" | "county";
  usps: string | null;
  countySlug?: string | null;
  countyName?: string;
  fillSource?: CountyFill["source"] | null;
  sourcePlace?: string | null;
}

export function sameHover(a: Hovered | null, b: Hovered | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.usps === b.usps &&
    a.countySlug === b.countySlug &&
    a.countyName === b.countyName &&
    a.fillSource === b.fillSource &&
    a.sourcePlace === b.sourcePlace
  );
}

/** Per-axis tinted hover stroke colors. */
const AXIS_HOVER_STROKE: Record<Axis, string> = {
  opacity: "rgba(229,62,62,0.72)",
  enforcementDiscretion: "rgba(59,130,246,0.72)",
  paternalism: "rgba(249,115,22,0.72)",
  problemSalience: "rgba(139,92,246,0.72)",
};

/** Matches theme.colors.penalty at the same 0.72 alpha as the axis strokes. */
const PENALTY_HOVER_STROKE = "rgba(16,185,129,0.72)";

export function hoverStrokeFor(layer: MapLayer, axis: Axis): string {
  return layer === "penalties" ? PENALTY_HOVER_STROKE : AXIS_HOVER_STROKE[axis];
}

/** Size a canvas backing store to its DPR-scaled pixel box (clears on change). */
export function syncCanvasSize(canvas: HTMLCanvasElement, size: Size): void {
  const bw = Math.round(size.w * size.dpr);
  const bh = Math.round(size.h * size.dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
}

export function beginWorldFrame(
  ctx: CanvasRenderingContext2D,
  size: Size,
  cam: Camera,
): void {
  const { dpr } = size;
  ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.tx, dpr * cam.ty);
}

export function buildStatePaths(): StatePathEntry[] {
  const gen = geoPath(usProjection);
  const baked: StatePathEntry[] = [];
  for (const f of stateFeatures) {
    const d = gen(f.geo);
    if (!d) continue;
    baked.push({
      usps: f.usps,
      path: new Path2D(d),
      bbox: boundsToBBox(gen.bounds(f.geo)),
    });
  }
  return baked;
}

export function buildCountyPaths(
  features: CountyFeatureEntry[],
): CountyPathEntry[] {
  const gen = geoPath(usProjection);
  const baked: CountyPathEntry[] = [];
  for (const f of features) {
    const d = gen(f.geo);
    if (!d) continue;
    baked.push({
      fips: f.fips,
      stateFips: f.stateFips,
      usps: fipsToUsps[f.stateFips] ?? null,
      name: f.name,
      path: new Path2D(d),
      bbox: boundsToBBox(gen.bounds(f.geo)),
    });
  }
  return baked;
}

export interface PaintBaseArgs {
  canvas: HTMLCanvasElement;
  size: Size;
  cam: Camera;
  focus: string | null;
  statePaths: StatePathEntry[];
  countyPaths: CountyPathEntry[];
  aggByUsps: Map<string, JurisdictionAgg>;
  fillByKey: Map<string, CountyFill>;
  paintByFips: Map<string, CountyFillPaint>;
  domain: Domain | null;
  axis: Axis;
  layer: MapLayer;
  sparseCounties: boolean;
  mapAggregatesInFlight: boolean;
  countiesInFlight: boolean;
}

export function paintMapBase({
  canvas,
  size,
  cam,
  focus,
  statePaths,
  countyPaths,
  aggByUsps,
  fillByKey,
  paintByFips,
  domain,
  axis,
  layer,
  sparseCounties,
  mapAggregatesInFlight,
  countiesInFlight,
}: PaintBaseArgs): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  syncCanvasSize(canvas, size);
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.colors.bg;
  ctx.fillRect(0, 0, w, h);
  beginWorldFrame(ctx, size, cam);

  const lw = 1 / cam.k;

  for (const e of statePaths) {
    const agg = e.usps ? aggByUsps.get(e.usps) : undefined;
    // Null value = not annotated under this layer; leave it unpainted rather
    // than bottoming out the ramp, which would read as a real low score.
    const value = agg ? layerValue(agg, layer, axis) : null;
    ctx.fillStyle =
      value !== null && domain
        ? rampColorForLayer(normalize(value, domain), layer, axis)
        : mapAggregatesInFlight
          ? "rgba(255,255,255,0.04)"
          : "rgba(255,255,255,0.015)";
    ctx.fill(e.path);
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  for (const e of statePaths) ctx.stroke(e.path);

  // In-flight state view is a flat wash + loading line, not a county mesh.
  if (focus && !countiesInFlight) {
    const focusedState = statePaths.find((e) => e.usps === focus);
    // Cover the focused state's choropleth so unscored counties stay unpainted
    // (a 1.5% white wash over the state fill still reads as "colored").
    if (focusedState) {
      ctx.fillStyle = theme.colors.bg;
      ctx.fill(focusedState.path);
    }
    const inState = countyPaths.filter((c) => c.usps === focus);
    if (!sparseCounties) {
      for (const e of inState) {
        const paint = paintByFips.get(e.fips);
        const agg = paint
          ? fillByKey.get(`${paint.source}:${paint.sourcePlace}`)
          : undefined;
        if (!agg || !domain) continue;
        const value = layerValue(agg, layer, axis);
        if (value === null) continue;
        ctx.fillStyle = rampColorForLayer(
          normalize(value, domain),
          layer,
          axis,
        );
        ctx.fill(e.path);
      }
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    for (const e of inState) ctx.stroke(e.path);
  }
}

export interface PaintOverlayArgs {
  canvas: HTMLCanvasElement;
  size: Size;
  cam: Camera;
  focus: string | null;
  hovered: Hovered | null;
  selectedState: string | null;
  selectedCounty: string | null;
  selectedCity: string | null;
  atlasCountyName: string | null;
  hoverStroke: string;
  statePaths: StatePathEntry[];
  countyPaths: CountyPathEntry[];
  paintByFips: Map<string, CountyFillPaint>;
}

export function paintMapOverlay({
  canvas,
  size,
  cam,
  focus,
  hovered,
  selectedState,
  selectedCounty,
  selectedCity,
  atlasCountyName,
  hoverStroke,
  statePaths,
  countyPaths,
  paintByFips,
}: PaintOverlayArgs): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  syncCanvasSize(canvas, size);
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  beginWorldFrame(ctx, size, cam);
  ctx.lineJoin = "round";

  const hoverIsSelection =
    hovered?.kind === "county"
      ? Boolean(
          (hovered.fillSource === "city" &&
            hovered.sourcePlace &&
            hovered.sourcePlace === selectedCity) ||
            (hovered.countySlug && hovered.countySlug === selectedCounty),
        )
      : Boolean(
          hovered?.usps && hovered.usps === selectedState && !selectedCounty,
        );
  if (hovered && !hoverIsSelection) {
    if (hovered.kind === "county" && focus) {
      const hoverEntry = countyPaths.find((e) => {
        if (e.usps !== focus) return false;
        const paint = paintByFips.get(e.fips);
        if (hovered.fillSource === "city" && hovered.sourcePlace) {
          return (
            paint?.source === "city" &&
            paint.sourcePlace === hovered.sourcePlace
          );
        }
        if (hovered.countySlug) {
          return paint?.countySlug === hovered.countySlug;
        }
        return e.name === hovered.countyName;
      });
      if (hoverEntry) {
        ctx.lineWidth = 1.5 / cam.k;
        ctx.strokeStyle = hoverStroke;
        ctx.stroke(hoverEntry.path);
      }
    } else if (hovered.kind === "state") {
      const hoverEntry = statePaths.find((e) => e.usps === hovered.usps);
      if (hoverEntry) {
        ctx.lineWidth = 1.5 / cam.k;
        ctx.strokeStyle = hoverStroke;
        ctx.stroke(hoverEntry.path);
      }
    }
  }

  if ((selectedCounty || selectedCity || atlasCountyName) && focus) {
    const se = countyPaths.find((e) => {
      if (e.usps !== focus) return false;
      const paint = paintByFips.get(e.fips);
      if (selectedCounty && paint?.countySlug === selectedCounty) return true;
      if (
        selectedCity &&
        paint?.source === "city" &&
        paint.sourcePlace === selectedCity
      ) {
        return true;
      }
      if (
        atlasCountyName &&
        normalizePlaceKey(e.name) === normalizePlaceKey(atlasCountyName)
      ) {
        return true;
      }
      return false;
    });
    if (se) {
      ctx.lineWidth = 2 / cam.k;
      ctx.strokeStyle = theme.colors.fg;
      ctx.stroke(se.path);
    }
  } else if (selectedState && !focus) {
    const se = statePaths.find((e) => e.usps === selectedState);
    if (se) {
      ctx.lineWidth = 2 / cam.k;
      ctx.strokeStyle = theme.colors.fg;
      ctx.stroke(se.path);
    }
  }
}

export function pickAt(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  focus: string | null,
  countyPaths: CountyPathEntry[],
  statePaths: StatePathEntry[],
  paintByFips: Map<string, CountyFillPaint>,
): Hovered | null {
  if (focus) {
    for (const e of countyPaths) {
      if (e.usps !== focus) continue;
      if (ctx.isPointInPath(e.path, wx, wy)) {
        const paint = paintByFips.get(e.fips);
        return {
          kind: "county",
          usps: e.usps,
          countySlug: paint?.countySlug ?? null,
          countyName: e.name,
          fillSource: paint?.source ?? null,
          sourcePlace: paint?.sourcePlace ?? null,
        };
      }
    }
    return null;
  }
  for (const e of statePaths) {
    if (ctx.isPointInPath(e.path, wx, wy)) {
      return { kind: "state", usps: e.usps };
    }
  }
  return null;
}
