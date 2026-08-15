import { feature } from "topojson-client";
import type { GeoPermissibleObjects } from "d3-geo";

import { normalizePlaceKey } from "@/lib/types";
import type { JurisdictionAgg } from "@/lib/types";

export interface CountyFeatureEntry {
  /** 5-digit county FIPS (state 2 + county 3). */
  fips: string;
  /** 2-digit state FIPS prefix. */
  stateFips: string;
  /** Atlas display name (e.g. "El Paso"). */
  name: string;
  geo: GeoPermissibleObjects;
}

interface RawFeature {
  id?: string | number;
  properties?: { name?: string } | null;
}

let cached: CountyFeatureEntry[] | null = null;
let inflight: Promise<CountyFeatureEntry[]> | null = null;

/**
 * Lazy-load us-atlas county geometry (~842 KB). Kept out of the initial
 * bundle; first state click triggers the dynamic import.
 */
export function loadCountyFeatures(): Promise<CountyFeatureEntry[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = import("us-atlas/counties-10m.json").then((mod) => {
    const countiesTopo = (mod.default ?? mod) as unknown as Parameters<
      typeof feature
    >[0];
    const countiesObject = (
      countiesTopo as unknown as { objects: { counties: Parameters<typeof feature>[1] } }
    ).objects.counties;
    const collection = feature(countiesTopo, countiesObject) as unknown as {
      features: RawFeature[];
    };
    cached = collection.features.map((f) => {
      const fips = String(f.id ?? "").padStart(5, "0");
      return {
        fips,
        stateFips: fips.slice(0, 2),
        name: f.properties?.name ?? "",
        geo: f as unknown as GeoPermissibleObjects,
      };
    });
    inflight = null;
    return cached;
  });
  return inflight;
}

export function countiesForState(
  all: CountyFeatureEntry[],
  stateFips: string,
): CountyFeatureEntry[] {
  return all.filter((c) => c.stateFips === stateFips);
}

/**
 * Join LOCUS county slugs to atlas features.
 * Duplicate atlas names in a state (county vs independent city) keep the
 * lower FIPS — LOCUS `_county` slugs mean the county.
 */
export function joinCountySlugs(
  features: CountyFeatureEntry[],
  locusCounties: JurisdictionAgg[],
): Map<string, string> {
  const byKey = new Map<string, CountyFeatureEntry>();
  for (const f of features) {
    const key = normalizePlaceKey(f.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || f.fips < existing.fips) byKey.set(key, f);
  }

  const fipsToSlug = new Map<string, string>();
  for (const row of locusCounties) {
    const slug = row.county;
    if (!slug) continue;
    const key = normalizePlaceKey(slug);
    const feature = key ? byKey.get(key) : undefined;
    if (feature && !fipsToSlug.has(feature.fips)) {
      fipsToSlug.set(feature.fips, slug);
    }
  }
  return fipsToSlug;
}
