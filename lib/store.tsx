"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import { focusesEqual, placeFilterFields } from "./place";
import type { Axis, LawFilters, LawSummary, MapLayer, PlaceDraft, PlaceFocus } from "./types";

export type { PlaceDraft, PlaceFocus };

/**
 * Global UI state shared across the map, sidebar, results, and modal.
 * Kept intentionally small; data fetching lives in the feature components.
 *
 * Place identity is `focus` + `placeDraft` only. `filters.state/city/county`
 * are derived at the query boundary via `queryFilters`.
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
  focus: PlaceFocus | null;
  placeDraft: PlaceDraft | null;
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
  focus: null,
  placeDraft: null,
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

function stripPlaceFields(filters: LawFilters): LawFilters {
  const next = { ...filters };
  delete next.state;
  delete next.city;
  delete next.county;
  return next;
}

/** LawFilters for the API — place fields come from focus + draft. */
export function queryFilters(state: ExplorerState): LawFilters {
  return {
    ...state.filters,
    ...placeFilterFields(state.focus, state.placeDraft),
  };
}

/** Place selection is one function so city / county / atlas stay mutually exclusive. */
function applyFocus(
  state: ExplorerState,
  focus: PlaceFocus | null,
): ExplorerState {
  if (focusesEqual(state.focus, focus) && state.placeDraft === null) {
    return state;
  }
  return {
    ...state,
    focus,
    placeDraft: null,
    filters: { ...stripPlaceFields(state.filters), page: 1 },
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
      const filters = stripPlaceFields({
        ...state.filters,
        ...incoming,
        page: incoming.page ?? 1,
      });
      return { ...state, filters };
    }
    case "setPage":
      return { ...state, filters: { ...state.filters, page: action.page } };
    case "resetFilters":
      return {
        ...state,
        filters: { ...initialFilters },
        focus: null,
        placeDraft: null,
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
      const value = action.value?.trim() || undefined;
      const placeDraft: PlaceDraft | null = value
        ? { field: action.field, value }
        : null;
      const focus = state.focus
        ? { kind: "state" as const, state: state.focus.state }
        : null;
      const sameDraft =
        (state.placeDraft === null && placeDraft === null) ||
        (state.placeDraft !== null &&
          placeDraft !== null &&
          state.placeDraft.field === placeDraft.field &&
          state.placeDraft.value === placeDraft.value);
      if (focusesEqual(state.focus, focus) && sameDraft) return state;
      return {
        ...state,
        focus,
        placeDraft,
        filters: { ...stripPlaceFields(state.filters), page: 1 },
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
