"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { PlaceFocus } from "@/components/jurisdiction/placeLookup";
import type { Axis, LawFilters, LawSummary, MapLayer } from "./types";

export type { PlaceFocus };

/**
 * Global UI state shared across the map, sidebar, results, and modal.
 * Kept intentionally small; data fetching lives in the feature components.
 */
export interface ExplorerState {
  axis: Axis;
  /**
   * What the choropleth encodes. Separate from `axis` on purpose: the four
   * axes are z-scored per-law scores, while the penalties layer is a share of
   * the sections a model read. Selecting an axis returns to the scores layer.
   */
  layer: MapLayer;
  filters: LawFilters;
  selectedState: string | null;
  /** Atlas-only county focus (no LOCUS slug). Fit/highlight only — not a results filter. */
  atlasCountyName: string | null;
  selectedLaw: LawSummary | null;
  unhinged: boolean;
  filtersOpen: boolean;
  filterResetVersion: number;
}

// A short page keeps the explorer feeling like a focused control surface while
// pagination still provides access to the complete corpus.
export const DEFAULT_PAGE_SIZE = 8;

const initialFilters: LawFilters = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
};

const initialState: ExplorerState = {
  axis: "opacity",
  layer: "scores",
  filters: initialFilters,
  selectedState: null,
  atlasCountyName: null,
  selectedLaw: null,
  unhinged: false,
  filtersOpen: false,
  filterResetVersion: 0,
};

export type ExplorerAction =
  | { type: "setAxis"; axis: Axis }
  | { type: "setLayer"; layer: MapLayer }
  | { type: "patchFilters"; filters: Partial<LawFilters> }
  | { type: "setPage"; page: number }
  | { type: "resetFilters" }
  | { type: "selectState"; state: string | null }
  | { type: "selectFocus"; focus: PlaceFocus | null }
  | { type: "setPlaceText"; field: "city" | "county"; value: string | undefined }
  | { type: "openLaw"; law: LawSummary }
  | { type: "closeLaw" }
  | { type: "toggleUnhinged" }
  | { type: "toggleFilters" }
  | { type: "closeFilters" };

function sameFocus(state: ExplorerState, focus: PlaceFocus | null): boolean {
  if (focus === null) {
    return (
      state.selectedState === null &&
      state.atlasCountyName === null &&
      state.filters.state === undefined &&
      state.filters.city === undefined &&
      state.filters.county === undefined
    );
  }
  if (focus.kind === "state") {
    return (
      state.selectedState === focus.state &&
      state.filters.state === focus.state &&
      state.filters.city === undefined &&
      state.filters.county === undefined &&
      state.atlasCountyName === null
    );
  }
  if (focus.kind === "city") {
    return (
      state.selectedState === focus.state &&
      state.filters.state === focus.state &&
      state.filters.city === focus.city &&
      state.filters.county === undefined &&
      state.atlasCountyName === null
    );
  }
  if (focus.kind === "county") {
    return (
      state.selectedState === focus.state &&
      state.filters.state === focus.state &&
      state.filters.county === focus.county &&
      state.filters.city === undefined &&
      state.atlasCountyName === null
    );
  }
  return (
    state.selectedState === focus.state &&
    state.filters.state === focus.state &&
    state.filters.city === undefined &&
    state.filters.county === undefined &&
    state.atlasCountyName === focus.name
  );
}

/** Place selection is one function so city / county / atlas stay mutually exclusive. */
function applyFocus(
  state: ExplorerState,
  focus: PlaceFocus | null,
): ExplorerState {
  if (sameFocus(state, focus)) return state;
  if (focus === null) {
    return {
      ...state,
      selectedState: null,
      atlasCountyName: null,
      filters: {
        ...state.filters,
        state: undefined,
        city: undefined,
        county: undefined,
        page: 1,
      },
    };
  }
  if (focus.kind === "state") {
    return {
      ...state,
      selectedState: focus.state,
      atlasCountyName: null,
      filters: {
        ...state.filters,
        state: focus.state,
        city: undefined,
        county: undefined,
        page: 1,
      },
    };
  }
  if (focus.kind === "city") {
    return {
      ...state,
      selectedState: focus.state,
      atlasCountyName: null,
      filters: {
        ...state.filters,
        state: focus.state,
        city: focus.city,
        county: undefined,
        page: 1,
      },
    };
  }
  if (focus.kind === "county") {
    return {
      ...state,
      selectedState: focus.state,
      atlasCountyName: null,
      filters: {
        ...state.filters,
        state: focus.state,
        city: undefined,
        county: focus.county,
        page: 1,
      },
    };
  }
  return {
    ...state,
    selectedState: focus.state,
    atlasCountyName: focus.name,
    filters: {
      ...state.filters,
      state: focus.state,
      city: undefined,
      county: undefined,
      page: 1,
    },
  };
}

export function explorerReducer(
  state: ExplorerState,
  action: ExplorerAction,
): ExplorerState {
  switch (action.type) {
    case "setAxis":
      // Picking an axis means "show me the scores", so it leaves the
      // penalties layer as well as setting the axis.
      return { ...state, axis: action.axis, layer: "scores" };
    case "setLayer":
      return { ...state, layer: action.layer };
    case "patchFilters": {
      // Place identity is selectFocus / setPlaceText only.
      const incoming = action.filters;
      const filters = {
        ...state.filters,
        ...incoming,
        page: incoming.page ?? 1,
        city: state.filters.city,
        county: state.filters.county,
        state: state.filters.state,
      };
      return { ...state, filters };
    }
    case "setPage":
      return { ...state, filters: { ...state.filters, page: action.page } };
    case "resetFilters":
      return {
        ...state,
        filters: { ...initialFilters },
        selectedState: null,
        atlasCountyName: null,
        filterResetVersion: state.filterResetVersion + 1,
      };
    case "selectState":
      return applyFocus(
        state,
        action.state ? { kind: "state", state: action.state } : null,
      );
    case "selectFocus":
      return applyFocus(state, action.focus);
    case "setPlaceText": {
      // Unresolved typed input: filter text only, no map zoom.
      const value = action.value;
      const city = action.field === "city" ? value : undefined;
      const county = action.field === "county" ? value : undefined;
      if (state.filters.city === city && state.filters.county === county) {
        return state;
      }
      return {
        ...state,
        atlasCountyName: null,
        filters: {
          ...state.filters,
          city,
          county,
          page: 1,
        },
      };
    }
    case "openLaw":
      return { ...state, selectedLaw: action.law };
    case "closeLaw":
      return { ...state, selectedLaw: null };
    case "toggleUnhinged":
      return { ...state, unhinged: !state.unhinged };
    case "toggleFilters":
      return { ...state, filtersOpen: !state.filtersOpen };
    case "closeFilters":
      return { ...state, filtersOpen: false };
    default:
      return state;
  }
}

interface ExplorerContextValue {
  state: ExplorerState;
  dispatch: React.Dispatch<ExplorerAction>;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(explorerReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within <ExplorerProvider>");
  return ctx;
}
