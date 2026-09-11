import { resolveCountySlug, type LawFilters, type PlaceDraft, type PlaceFocus } from "./types";

export function focusState(focus: PlaceFocus | null): string | null {
  return focus?.state ?? null;
}

export function atlasCountyName(focus: PlaceFocus | null): string | null {
  return focus?.kind === "atlas" ? focus.name : null;
}

export function cityFilter(
  focus: PlaceFocus | null,
  draft: PlaceDraft | null,
): string | undefined {
  if (draft?.field === "city") return draft.value;
  if (focus?.kind === "city") return focus.city;
  return undefined;
}

export function countyFilter(
  focus: PlaceFocus | null,
  draft: PlaceDraft | null,
): string | undefined {
  if (draft?.field === "county") return draft.value;
  if (focus?.kind === "county") return focus.county;
  return undefined;
}

/** Place fields the laws API accepts — derived from focus + draft only. */
export function placeFilterFields(
  focus: PlaceFocus | null,
  draft: PlaceDraft | null,
): Pick<LawFilters, "state" | "city" | "county"> {
  return {
    state: focus?.state,
    city: cityFilter(focus, draft),
    county: countyFilter(focus, draft),
  };
}

/**
 * County detail fetch slug. A committed county focus is already canonical —
 * do not wait for the state county list. Draft/typed input still goes through
 * `resolveCountySlug`. `awaiting` means a county is selected but the list has
 * not arrived, so callers must not report ready.
 */
export function countyDetailRequest(opts: {
  selectedState: string | null;
  selectedCounty: string | undefined;
  focus: PlaceFocus | null;
  counties: Array<{ county: string | null }> | null | undefined;
}): { slug: string | null; awaiting: boolean } {
  const { selectedState, selectedCounty, focus, counties } = opts;
  if (!selectedState || !selectedCounty) {
    return { slug: null, awaiting: false };
  }
  if (focus?.kind === "county") {
    return { slug: focus.county, awaiting: false };
  }
  const fromList = resolveCountySlug(counties, selectedCounty);
  if (fromList) return { slug: fromList, awaiting: false };
  // `[]` is a loaded state with no county places, not "list has not arrived".
  return { slug: null, awaiting: counties == null };
}

export function focusesEqual(
  a: PlaceFocus | null,
  b: PlaceFocus | null,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.state !== b.state) return false;
  if (a.kind === "city" && b.kind === "city") return a.city === b.city;
  if (a.kind === "county" && b.kind === "county") return a.county === b.county;
  if (a.kind === "atlas" && b.kind === "atlas") return a.name === b.name;
  return true;
}
