"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useExplorer } from "@/lib/store";
import {
  matchCountySlug,
  stateName,
  type CountyFill,
  type JurisdictionAgg,
} from "@/lib/types";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import { computeLayerDomain, type Domain } from "./color";
import { resolveFillRows } from "./counties";
import { COUNTY_FILL_MIN, countyScaleReady } from "./sparseCounties";

const EMPTY_ROWS: JurisdictionAgg[] = [];

export interface MapViewValue {
  countiesBaked: boolean;
  setCountiesBaked: (baked: boolean) => void;
  fillRows: CountyFill[];
  fillByKey: Map<string, CountyFill>;
  scoredCounties: CountyFill[];
  scoredCountyN: number;
  sparseCounties: boolean;
  countyViewReady: boolean;
  domain: Domain | null;
  selectedCounty: string | null;
  aggByUsps: Map<string, JurisdictionAgg>;
  rows: JurisdictionAgg[];
  countiesInFlight: boolean;
  mapAggregatesInFlight: boolean;
  loadingLine: string | null;
}

const MapViewContext = createContext<MapViewValue | null>(null);

export function MapViewProvider({ children }: { children: ReactNode }) {
  const { state } = useExplorer();
  const { data, status, stateDetail, stateDetailStatus } = useJurisdictions();
  const [countiesBaked, setCountiesBaked] = useState(false);

  const axis = state.axis;
  const layer = state.layer;
  const selectedState = state.selectedState;
  const selectedCountyRaw = state.filters.county ?? null;
  const rows = data?.rows ?? EMPTY_ROWS;
  const countyRows = stateDetail?.counties ?? EMPTY_ROWS;

  const fillRows = useMemo(
    () => resolveFillRows(stateDetail),
    [stateDetail],
  );

  const fillByKey = useMemo(() => {
    const m = new Map<string, CountyFill>();
    for (const r of fillRows) m.set(`${r.source}:${r.sourcePlace}`, r);
    return m;
  }, [fillRows]);

  const aggByUsps = useMemo(() => {
    const m = new Map<string, JurisdictionAgg>();
    for (const r of rows) if (r.state) m.set(r.state.toLowerCase(), r);
    return m;
  }, [rows]);

  const selectedCounty = selectedCountyRaw
    ? (matchCountySlug(countyRows, selectedCountyRaw) ?? selectedCountyRaw)
    : null;

  const scoredCounties = useMemo(
    () => fillRows.filter((r) => r.sourcePlace),
    [fillRows],
  );
  const scoredCountyN = scoredCounties.length;

  const sparseCounties = Boolean(
    selectedState && stateDetail && scoredCountyN < COUNTY_FILL_MIN,
  );

  const countyViewReady = countyScaleReady({
    selectedState,
    hasDetail: Boolean(stateDetail),
    countiesBaked,
  });

  const mapAggregatesInFlight = status === "loading" && rows.length === 0;
  const countiesInFlight =
    Boolean(selectedState) &&
    stateDetailStatus !== "error" &&
    (!countiesBaked || !stateDetail || stateDetailStatus === "loading");

  const loadingLine =
    countiesInFlight && selectedState
      ? `Loading counties in ${stateName(selectedState)}.`
      : mapAggregatesInFlight
        ? "Loading the map."
        : null;

  const domain = useMemo(
    () =>
      computeLayerDomain(
        layer,
        axis,
        countyViewReady && !sparseCounties ? fillRows : rows,
      ),
    [layer, axis, countyViewReady, sparseCounties, fillRows, rows],
  );

  const value = useMemo(
    () => ({
      countiesBaked,
      setCountiesBaked,
      fillRows,
      fillByKey,
      scoredCounties,
      scoredCountyN,
      sparseCounties,
      countyViewReady,
      domain,
      selectedCounty,
      aggByUsps,
      rows,
      countiesInFlight,
      mapAggregatesInFlight,
      loadingLine,
    }),
    [
      countiesBaked,
      fillRows,
      fillByKey,
      scoredCounties,
      scoredCountyN,
      sparseCounties,
      countyViewReady,
      domain,
      selectedCounty,
      aggByUsps,
      rows,
      countiesInFlight,
      mapAggregatesInFlight,
      loadingLine,
    ],
  );

  return (
    <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>
  );
}

export function useMapView(): MapViewValue {
  const value = useContext(MapViewContext);
  if (!value) {
    throw new Error("useMapView must be used within MapViewProvider");
  }
  return value;
}
