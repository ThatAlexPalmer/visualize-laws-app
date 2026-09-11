import {
  isCompleteNational,
  type JurisdictionsResponse,
} from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJurisdictions(body: unknown): JurisdictionsResponse {
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

/**
 * Load the US map payload. Incomplete `national` is an error, never success —
 * returning it would let the provider set status `"ready"` on a hollow map.
 */
export async function fetchJurisdictions(
  signal: AbortSignal,
  reload = false,
): Promise<JurisdictionsResponse> {
  let lastError: unknown;

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
        throw new Error("Jurisdiction aggregates are incomplete");
      }
      return body;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError;
}
