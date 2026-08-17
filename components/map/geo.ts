import { feature } from "topojson-client";
import { geoAlbersUsa } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import statesTopo from "us-atlas/states-10m.json";

import { fipsToUsps } from "./fips";

/** Size-independent world the mesh is baked into. Camera maps this to the canvas. */
export const WORLD = { w: 960, h: 600, pad: 24 };

export interface StateFeatureEntry {
  /** 2-digit FIPS code from the us-atlas geometry id. */
  fips: string;
  /** Lowercase USPS code (matches LOCUS `state`); null for unmapped territories. */
  usps: string | null;
  /** Human-readable state name from the geometry properties. */
  name: string;
  /** The GeoJSON feature, ready to hand to d3-geo's projection / path generator. */
  geo: GeoPermissibleObjects;
}

// us-atlas ships a TopoJSON Topology. Its precise types live in
// `topojson-specification`, which isn't directly importable from app code under
// pnpm, so we reach the parameter types through `feature` itself and cast the
// raw JSON to match. This is purely a typing convenience — at runtime
// topojson-client operates on the plain object as expected.
const topo = statesTopo as unknown as Parameters<typeof feature>[0];
const statesObject = topo.objects.states as Parameters<typeof feature>[1];

interface RawFeature {
  id?: string | number;
  properties?: { name?: string } | null;
}

const collection = feature(topo, statesObject) as unknown as {
  features: RawFeature[];
};

/** The full state FeatureCollection — used to fit the one-time US projection. */
export const stateFeatureCollection = collection as unknown as GeoPermissibleObjects;

/** Fixed Albers USA. Do not fitExtent this again on zoom or resize. */
export const usProjection = geoAlbersUsa().fitExtent(
  [
    [WORLD.pad, WORLD.pad],
    [WORLD.w - WORLD.pad, WORLD.h - WORLD.pad],
  ],
  stateFeatureCollection,
);

/** One entry per state geometry, tagged with FIPS + lowercase USPS codes. */
export const stateFeatures: StateFeatureEntry[] = collection.features.map((f) => {
  const fips = String(f.id ?? "").padStart(2, "0");
  return {
    fips,
    usps: fipsToUsps[fips] ?? null,
    name: f.properties?.name ?? "",
    geo: f as unknown as GeoPermissibleObjects,
  };
});
