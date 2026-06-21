"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import type { Axis, LawFilters, LawRecord } from "./types";

/**
 * Global UI state shared across the map, sidebar, results, and modal.
 * Kept intentionally small; data fetching lives in the feature components.
 */
export interface ExplorerState {
  axis: Axis;
  filters: LawFilters;
  selectedState: string | null;
  selectedLaw: LawRecord | null;
}

export const DEFAULT_PAGE_SIZE = 25;

const initialFilters: LawFilters = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
};

const initialState: ExplorerState = {
  axis: "opacity",
  filters: initialFilters,
  selectedState: null,
  selectedLaw: null,
};

export type ExplorerAction =
  | { type: "setAxis"; axis: Axis }
  | { type: "patchFilters"; filters: Partial<LawFilters> }
  | { type: "setPage"; page: number }
  | { type: "resetFilters" }
  | { type: "selectState"; state: string | null }
  | { type: "openLaw"; law: LawRecord }
  | { type: "closeLaw" };

function reducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "setAxis":
      return { ...state, axis: action.axis };
    case "patchFilters":
      // Any filter change (other than page itself) resets to page 1.
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.filters,
          page: action.filters.page ?? 1,
        },
      };
    case "setPage":
      return { ...state, filters: { ...state.filters, page: action.page } };
    case "resetFilters":
      return { ...state, filters: { ...initialFilters }, selectedState: null };
    case "selectState":
      return {
        ...state,
        selectedState: action.state,
        filters: { ...state.filters, state: action.state ?? undefined, page: 1 },
      };
    case "openLaw":
      return { ...state, selectedLaw: action.law };
    case "closeLaw":
      return { ...state, selectedLaw: null };
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
