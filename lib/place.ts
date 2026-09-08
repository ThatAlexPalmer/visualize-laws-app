import type { LawFilters, PlaceDraft, PlaceFocus } from "./types";

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

export function focusesEqual(
  a: PlaceFocus | null,
  b: PlaceFocus | null,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.state !== b.state) return false;
  if (a.kind === "city") return a.city === b.city;
  if (a.kind === "county") return a.county === b.county;
  if (a.kind === "atlas") return a.name === b.name;
  return true;
}
