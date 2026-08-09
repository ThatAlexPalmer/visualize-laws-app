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
import type {
  JurisdictionAgg,
  JurisdictionsResponse,
} from "@/lib/types";

type JurisdictionsStatus = "loading" | "ready" | "error";

interface JurisdictionsContextValue {
  data: JurisdictionsResponse | null;
  status: JurisdictionsStatus;
  retry: () => void;
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

function isJurisdictionsResponse(value: unknown): value is JurisdictionsResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) return false;
  return (
    value.rows.every(isJurisdictionAgg) &&
    (value.national === null || isJurisdictionAgg(value.national))
  );
}

async function fetchJurisdictions(signal: AbortSignal): Promise<JurisdictionsResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/jurisdictions", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        throw new Error(`Jurisdiction request failed with ${response.status}`);
      }

      const body: unknown = await response.json();
      if (!isJurisdictionsResponse(body)) {
        throw new Error("Jurisdiction response has an invalid shape");
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

  throw lastError;
}

export function JurisdictionsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<JurisdictionsResponse | null>(null);
  const [status, setStatus] = useState<JurisdictionsStatus>("loading");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    fetchJurisdictions(controller.signal)
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

  const value = useMemo(
    () => ({ data, status, retry }),
    [data, status, retry],
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
