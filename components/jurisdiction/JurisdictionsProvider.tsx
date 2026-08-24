"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useExplorer } from "@/lib/store";
import { matchCountySlug } from "@/lib/types";
import {
  isCompleteNational,
  type CityAgg,
  type CountyFill,
  type JurisdictionAgg,
  type JurisdictionDetailResponse,
  type JurisdictionsResponse,
} from "@/lib/types";

type JurisdictionsStatus = "loading" | "ready" | "error";

interface JurisdictionsContextValue {
  data: JurisdictionsResponse | null;
  status: JurisdictionsStatus;
  retry: () => void;
  /** Cached GET /api/jurisdictions/[state] for the selected state. */
  stateDetail: JurisdictionDetailResponse | null;
  stateDetailStatus: JurisdictionsStatus;
  /** County-scoped detail when a county filter is set; else null. */
  countyDetail: JurisdictionDetailResponse | null;
  countyDetailStatus: JurisdictionsStatus;
}

const JurisdictionsContext = createContext<JurisdictionsContextValue | null>(null);

const NUMBER_FIELDS: (keyof JurisdictionAgg)[] = [
  "lawCount",
  "substantiveCount",
  "avgOpacity",
  "avgEnforcementDiscretion",
  "avgPaternalism",
  "avgProblemSalience",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJurisdictionAgg(value: unknown): value is JurisdictionAgg {
  if (!isRecord(value)) return false;
  return (
    typeof value.level === "string" &&
    (typeof value.state === "string" || value.state === null) &&
    (typeof value.county === "string" || value.county === null) &&
    typeof value.name === "string" &&
    NUMBER_FIELDS.every((field) => typeof value[field] === "number")
  );
}

function isCityAgg(value: unknown): value is CityAgg {
  return (
    isRecord(value) &&
    typeof value.city === "string" &&
    typeof value.lawCount === "number"
  );
}

function isCountyFill(value: unknown): value is CountyFill {
  if (!isRecord(value)) return false;
  return (
    typeof value.state === "string" &&
    (typeof value.fips === "string" || value.fips === null) &&
    (value.source === "county" || value.source === "city") &&
    typeof value.sourcePlace === "string" &&
    (typeof value.county === "string" || value.county === null) &&
    typeof value.name === "string" &&
    NUMBER_FIELDS.every((field) => typeof value[field] === "number")
  );
}

function isJurisdictionsResponse(value: unknown): value is JurisdictionsResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) return false;
  return (
    value.rows.every(isJurisdictionAgg) &&
    (value.national === null || isJurisdictionAgg(value.national))
  );
}

function isJurisdictionDetailResponse(
  value: unknown,
): value is JurisdictionDetailResponse {
  if (!isRecord(value) || !Array.isArray(value.topLaws)) return false;
  const counties = Array.isArray(value.counties) ? value.counties : [];
  const topCities = Array.isArray(value.topCities) ? value.topCities : [];
  const countyFills = Array.isArray(value.countyFills) ? value.countyFills : [];
  return (
    (value.jurisdiction === null || isJurisdictionAgg(value.jurisdiction)) &&
    counties.every(isJurisdictionAgg) &&
    topCities.every(isCityAgg) &&
    countyFills.every(isCountyFill)
  );
}

function normalizeDetail(body: JurisdictionDetailResponse): JurisdictionDetailResponse {
  return {
    jurisdiction: body.jurisdiction,
    topLaws: body.topLaws,
    counties: body.counties ?? [],
    countyFills: body.countyFills ?? [],
    topCities: body.topCities ?? [],
  };
}

async function fetchJurisdictions(
  signal: AbortSignal,
  reload = false,
): Promise<JurisdictionsResponse> {
  let lastError: unknown;
  let lastIncomplete: JurisdictionsResponse | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/jurisdictions", {
        signal,
        ...(reload || attempt > 0 ? { cache: "reload" } : {}),
      });
      if (!response.ok) {
        throw new Error(`Jurisdiction request failed with ${response.status}`);
      }

      const body: unknown = await response.json();
      if (!isJurisdictionsResponse(body)) {
        throw new Error("Jurisdiction response has an invalid shape");
      }
      // Incomplete seed snapshots are not a cacheable success. Retry once
      // (bypass HTTP cache) so `national: null` cannot stick as "ready".
      if (!isCompleteNational(body)) {
        lastIncomplete = body;
        throw new Error("Jurisdiction aggregates are incomplete");
      }
      return body;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    }
  }

  if (lastIncomplete) return lastIncomplete;
  throw lastError;
}

async function fetchJurisdictionDetail(
  state: string,
  county: string | null,
  signal: AbortSignal,
): Promise<JurisdictionDetailResponse> {
  const qs = county ? `?county=${encodeURIComponent(county)}` : "";
  const response = await fetch(
    `/api/jurisdictions/${encodeURIComponent(state)}${qs}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) {
    throw new Error(`Jurisdiction detail failed with ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isJurisdictionDetailResponse(body)) {
    throw new Error("Jurisdiction detail has an invalid shape");
  }
  return normalizeDetail(body);
}

export function JurisdictionsProvider({ children }: { children: ReactNode }) {
  const { state: explorer } = useExplorer();
  const selectedState = explorer.selectedState;
  const selectedCounty = explorer.filters.county;

  const [data, setData] = useState<JurisdictionsResponse | null>(null);
  const [status, setStatus] = useState<JurisdictionsStatus>("loading");
  const [requestVersion, setRequestVersion] = useState(0);

  const [detailByState, setDetailByState] = useState<
    Record<string, JurisdictionDetailResponse>
  >({});
  const [stateDetailStatus, setStateDetailStatus] =
    useState<JurisdictionsStatus>("ready");
  const [countyDetailByKey, setCountyDetailByKey] = useState<
    Record<string, JurisdictionDetailResponse>
  >({});
  const [countyDetailStatus, setCountyDetailStatus] =
    useState<JurisdictionsStatus>("ready");

  const inflightState = useRef<string | null>(null);
  const inflightCounty = useRef<string | null>(null);
  // state code -> national lawCount we last fetched detail for. Used to
  // retry a cached empty county list after aggregates are rebuilt.
  const emptyCountyFetchAt = useRef<Record<string, number>>({});

  const retry = useCallback(() => {
    emptyCountyFetchAt.current = {};
    setDetailByState({});
    setCountyDetailByKey({});
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    fetchJurisdictions(controller.signal, requestVersion > 0)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        emptyCountyFetchAt.current = {};
        // Drop per-state caches so an empty `counties: []` from before
        // aggregate recompute cannot keep the choropleth uncolored.
        setDetailByState({});
        setCountyDetailByKey({});
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [requestVersion]);

  // Per-state detail (counties + state aggregate + top laws + top cities).
  // Cached by state code so the map choropleth and the panel share one request.
  useEffect(() => {
    if (!selectedState) {
      setStateDetailStatus("ready");
      inflightState.current = null;
      return;
    }
    const cached = detailByState[selectedState];
    const nationalCount =
      data?.rows.find((row) => row.state === selectedState)?.lawCount ?? 0;
    const staleEmptyCounties =
      Boolean(cached) &&
      cached.counties.length === 0 &&
      nationalCount > 0 &&
      emptyCountyFetchAt.current[selectedState] !== nationalCount;
    if (cached && !staleEmptyCounties) {
      setStateDetailStatus("ready");
      return;
    }

    const controller = new AbortController();
    inflightState.current = selectedState;
    setStateDetailStatus("loading");

    fetchJurisdictionDetail(selectedState, null, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        emptyCountyFetchAt.current[selectedState] = nationalCount;
        setDetailByState((prev) => ({ ...prev, [selectedState]: detail }));
        setStateDetailStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStateDetailStatus("error");
      });

    return () => {
      controller.abort();
      if (inflightState.current === selectedState) inflightState.current = null;
    };
  }, [selectedState, detailByState, data]);

  const stateDetail = selectedState
    ? (detailByState[selectedState] ?? null)
    : null;

  const resolvedCountySlug =
    selectedState && selectedCounty && stateDetail
      ? matchCountySlug(stateDetail.counties, selectedCounty)
      : selectedCounty?.trim()
        ? selectedCounty.trim().toLowerCase()
        : null;

  const countyCacheKey =
    selectedState && resolvedCountySlug
      ? `${selectedState}:${resolvedCountySlug}`
      : null;

  useEffect(() => {
    if (!selectedState || !resolvedCountySlug || !countyCacheKey) {
      setCountyDetailStatus("ready");
      inflightCounty.current = null;
      return;
    }
    if (countyDetailByKey[countyCacheKey]) {
      setCountyDetailStatus("ready");
      return;
    }

    const controller = new AbortController();
    inflightCounty.current = countyCacheKey;
    setCountyDetailStatus("loading");

    fetchJurisdictionDetail(selectedState, resolvedCountySlug, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setCountyDetailByKey((prev) => ({ ...prev, [countyCacheKey]: detail }));
        setCountyDetailStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCountyDetailStatus("error");
      });

    return () => {
      controller.abort();
      if (inflightCounty.current === countyCacheKey) {
        inflightCounty.current = null;
      }
    };
  }, [selectedState, resolvedCountySlug, countyCacheKey, countyDetailByKey]);

  const countyDetail = countyCacheKey
    ? (countyDetailByKey[countyCacheKey] ?? null)
    : null;

  const value = useMemo(
    () => ({
      data,
      status,
      retry,
      stateDetail,
      stateDetailStatus,
      countyDetail,
      countyDetailStatus,
    }),
    [
      data,
      status,
      retry,
      stateDetail,
      stateDetailStatus,
      countyDetail,
      countyDetailStatus,
    ],
  );

  return (
    <JurisdictionsContext.Provider value={value}>
      {children}
    </JurisdictionsContext.Provider>
  );
}

export function useJurisdictions(): JurisdictionsContextValue {
  const value = useContext(JurisdictionsContext);
  if (!value) {
    throw new Error("useJurisdictions must be used within JurisdictionsProvider");
  }
  return value;
}
