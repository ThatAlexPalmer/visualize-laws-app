import type { PlaceMatch } from "@/lib/types";

export function pickPlace<T extends { state: string; lawCount: number }>(
  places: T[],
  currentState: string | null,
): T | null {
  if (places.length === 0) return null;
  if (currentState) {
    const here = places.find((p) => p.state === currentState);
    if (here) return here;
  }
  return places[0] ?? null;
}

export async function lookupPlaces(
  kind: "city" | "county",
  q: string,
  signal?: AbortSignal,
): Promise<PlaceMatch[]> {
  const qs = new URLSearchParams({ [kind]: q });
  const response = await fetch(`/api/jurisdictions?${qs}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("places" in body)) return [];
  const places = (body as { places: unknown }).places;
  if (!Array.isArray(places)) return [];
  return places.filter((row): row is PlaceMatch => {
    if (!row || typeof row !== "object") return false;
    const r = row as PlaceMatch;
    return typeof r.state === "string" && typeof r.lawCount === "number";
  });
}
