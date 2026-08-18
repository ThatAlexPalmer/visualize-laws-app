"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { Axis, LawFilters, LawSummary } from "./types";

/**
 * Global UI state shared across the map, sidebar, results, and modal.
 * Kept intentionally small; data fetching lives in the feature components.
 */
export interface ExplorerState {
  axis: Axis;
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
  | { type: "patchFilters"; filters: Partial<LawFilters> }
  | { type: "setPage"; page: number }
  | { type: "resetFilters" }
  | { type: "selectState"; state: string | null }
  | {
      type: "selectPlace";
      state: string;
      city?: string;
      county?: string;
      atlasCountyName?: string;
    }
  | { type: "openLaw"; law: LawSummary }
  | { type: "closeLaw" }
  | { type: "toggleUnhinged" }
  | { type: "toggleFilters" }
  | { type: "closeFilters" };

function reducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "setAxis":
      return { ...state, axis: action.axis };
    case "patchFilters": {
      // Any filter change (other than page itself) resets to page 1.
      // City and county are mutually exclusive: setting one clears the other.
      const incoming = action.filters;
      const filters = {
        ...state.filters,
        ...incoming,
        page: incoming.page ?? 1,
      };
      if (incoming.city && incoming.county === undefined) {
        filters.county = undefined;
      }
      if (incoming.county && incoming.city === undefined) {
        filters.city = undefined;
      }
      return {
        ...state,
        atlasCountyName:
          incoming.city !== undefined || incoming.county !== undefined
            ? null
            : state.atlasCountyName,
        filters,
      };
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
      return {
        ...state,
        selectedState: action.state,
        atlasCountyName: null,
        filters: {
          ...state.filters,
          state: action.state ?? undefined,
          county: undefined,
          city: undefined,
          page: 1,
        },
      };
    case "selectPlace": {
      const city = action.city;
      const county = action.county;
      const atlasCountyName = county ? null : (action.atlasCountyName ?? null);
      if (
        state.selectedState === action.state &&
        state.filters.city === city &&
        state.filters.county === county &&
        state.atlasCountyName === atlasCountyName
      ) {
        return state;
      }
      return {
        ...state,
        selectedState: action.state,
        atlasCountyName,
        filters: {
          ...state.filters,
          state: action.state,
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
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within <ExplorerProvider>");
  return ctx;
}
