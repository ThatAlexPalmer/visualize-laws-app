"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Held<T> = { key: string; value: T };
export type FetchStatus = "idle" | "loading" | "ready" | "error";

/**
 * Pair a held result with the requested key. A cache miss or a different key
 * must not return the previous value (TX detail must not render as CA).
 */
export function heldForKey<T>(
  held: Held<T> | null,
  key: string | null,
  cache: Map<string, T>,
): Held<T> | null {
  if (key === null) return null;
  if (held && held.key === key) return held;
  const hit = cache.get(key);
  if (hit === undefined) return null;
  return { key, value: hit };
}

/** Status belongs to `key` only — a ready TX fetch is loading/error for CA. */
export function statusForKey(
  key: string | null,
  paired: Held<unknown> | null,
  errorKey: string | null,
): FetchStatus {
  if (key === null) return "idle";
  if (paired && paired.key === key) return "ready";
  if (errorKey === key) return "error";
  return "loading";
}

/**
 * Fetch-and-cache by key. The cache map is a ref, so writing it does not
 * retrigger the effect that produced the write.
 */
export function useCachedFetch<T>(
  key: string | null,
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
  useCache = true,
): { value: T | undefined; status: FetchStatus; retry: () => void } {
  const cache = useRef(new Map<string, T>());
  const active = useRef<AbortController | null>(null);
  const [version, setVersion] = useState(0);
  const [held, setHeld] = useState<Held<T> | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const retry = useCallback(() => {
    active.current?.abort();
    if (key) cache.current.delete(key);
    setHeld(null);
    setErrorKey(null);
    setVersion((v) => v + 1);
  }, [key]);

  const run = useCallback(
    (nextKey: string | null) => {
      const next = heldForKey(null, nextKey, cache.current);
      if (!nextKey) {
        setHeld(null);
        setErrorKey(null);
        return;
      }
      if (next) {
        setHeld(next);
        setErrorKey(null);
        return;
      }
      setHeld(null);
      setErrorKey(null);
      const controller = new AbortController();
      active.current = controller;
      Promise.resolve().then(() => fetcher(nextKey, controller.signal))
        .then((result) => {
          if (controller.signal.aborted) return;
          if (useCache) cache.current.set(nextKey, result);
          setHeld({ key: nextKey, value: result });
          setErrorKey(null);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setHeld(null);
          setErrorKey(nextKey);
        });
      return () => controller.abort();
    },
    [fetcher, useCache],
  );

  useEffect(() => run(key), [key, run, version]);

  const paired = heldForKey(held, key, cache.current);
  return {
    value: paired?.value,
    status: statusForKey(key, paired, errorKey),
    retry,
  };
}
