"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useExplorer } from "@/lib/store";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { matchCountySlug } from "@/lib/types";
import {
  isCompleteNational,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJurisdictions(body: unknown): JurisdictionsResponse {
  if (!isRecord(body) || !Array.isArray(body.rows)) {
    throw new Error("Jurisdiction response has an invalid shape");
  }
  return {
    rows: body.rows as JurisdictionsResponse["rows"],
    national:
      body.national === undefined
        ? null
        : (body.national as JurisdictionsResponse["national"]),
  };
}

function readDetail(body: unknown): JurisdictionDetailResponse {
  if (!isRecord(body) || !Array.isArray(body.topLaws)) {
    throw new Error("Jurisdiction detail has an invalid shape");
  }
  return {
    jurisdiction:
      body.jurisdiction === null || body.jurisdiction === undefined
        ? null
        : (body.jurisdiction as JurisdictionDetailResponse["jurisdiction"]),
    topLaws: body.topLaws as JurisdictionDetailResponse["topLaws"],
    counties: Array.isArray(body.counties)
      ? (body.counties as JurisdictionDetailResponse["counties"])
      : [],
    countyFills: Array.isArray(body.countyFills)
      ? (body.countyFills as JurisdictionDetailResponse["countyFills"])
      : [],
    topCities: Array.isArray(body.topCities)
      ? (body.topCities as JurisdictionDetailResponse["topCities"])
      : [],
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
      const body = readJurisdictions(await response.json());
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
  return readDetail(await response.json());
}

export function JurisdictionsProvider({ children }: { children: ReactNode }) {
  const { state: explorer } = useExplorer();
  const selectedState = explorer.selectedState;
  const selectedCounty = explorer.filters.county;

  const [data, setData] = useState<JurisdictionsResponse | null>(null);
  const [status, setStatus] = useState<JurisdictionsStatus>("loading");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetchJurisdictions(controller.signal, requestVersion > 0)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData(null);
        setStatus("error");
      });
    return () => controller.abort();
  }, [requestVersion]);

  const nationalCount =
    selectedState
      ? (data?.rows.find((row) => row.state === selectedState)?.lawCount ?? 0)
      : 0;

  // nationalCount is in the key so an empty county list from before aggregate
  // rebuild cannot stick after the US row's lawCount changes.
  const stateKey =
    selectedState && data ? `state:${selectedState}:${nationalCount}` : null;

  const fetchState = useCallback(
    (key: string, signal: AbortSignal) => {
      const code = key.split(":")[1];
      return fetchJurisdictionDetail(code, null, signal);
    },
    [],
  );
  const stateFetch = useCachedFetch(stateKey, fetchState);

  const stateDetail = stateFetch.value ?? null;
  const stateDetailStatus: JurisdictionsStatus = !selectedState
    ? "ready"
    : stateFetch.status === "error"
      ? "error"
      : stateFetch.status === "ready"
        ? "ready"
        : "loading";

  const resolvedCountySlug =
    selectedState && selectedCounty && stateDetail
      ? matchCountySlug(stateDetail.counties, selectedCounty)
      : selectedCounty?.trim()
        ? selectedCounty.trim().toLowerCase()
        : null;

  const countyKey =
    selectedState && resolvedCountySlug
      ? `county:${selectedState}:${resolvedCountySlug}`
      : null;

  const fetchCounty = useCallback((key: string, signal: AbortSignal) => {
    const parts = key.split(":");
    return fetchJurisdictionDetail(parts[1], parts.slice(2).join(":"), signal);
  }, []);
  const countyFetch = useCachedFetch(countyKey, fetchCounty);

  const countyDetail = countyKey ? (countyFetch.value ?? null) : null;
  const countyDetailStatus: JurisdictionsStatus = !countyKey
    ? "ready"
    : countyFetch.status === "error"
      ? "error"
      : countyFetch.status === "ready"
        ? "ready"
        : "loading";

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
