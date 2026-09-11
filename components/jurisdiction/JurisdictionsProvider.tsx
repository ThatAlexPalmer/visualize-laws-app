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
import { countyDetailRequest, countyFilter, focusState } from "@/lib/place";
import { useCachedFetch } from "@/lib/useCachedFetch";
import type {
  JurisdictionDetailResponse,
  JurisdictionsResponse,
} from "@/lib/types";
import { fetchJurisdictions } from "./fetchJurisdictions";

type JurisdictionsStatus = "loading" | "ready" | "error";

interface JurisdictionsContextValue {
  data: JurisdictionsResponse | null;
  status: JurisdictionsStatus;
  retry: () => void;
  /** Cached GET /api/jurisdictions/[state] for the selected state. */
  stateDetail: JurisdictionDetailResponse | null;
  stateDetailStatus: JurisdictionsStatus;
  retryState: () => void;
  /** County-scoped detail when a county filter is set; else null. */
  countyDetail: JurisdictionDetailResponse | null;
  countyDetailStatus: JurisdictionsStatus;
  retryCounty: () => void;
}

const JurisdictionsContext = createContext<JurisdictionsContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  const selectedState = focusState(explorer.focus);
  const selectedCounty = countyFilter(explorer.focus, explorer.placeDraft);

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

  const { slug: resolvedCountySlug, awaiting: awaitingCountySlug } =
    countyDetailRequest({
      selectedState,
      selectedCounty,
      focus: explorer.focus,
      counties: stateDetail?.counties,
    });

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
  const countyDetailStatus: JurisdictionsStatus = awaitingCountySlug
    ? "loading"
    : !countyKey
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
      retryState: stateFetch.retry,
      retryCounty: countyFetch.retry,
    }),
    [
      stateFetch.retry,
      countyFetch.retry,
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
