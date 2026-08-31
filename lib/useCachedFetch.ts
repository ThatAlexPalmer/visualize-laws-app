"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-and-cache by key. The cache map is a ref, so writing it does not
 * retrigger the effect that produced the write.
 */
export function useCachedFetch<T>(
  key: string | null,
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
): { value: T | undefined; status: "idle" | "loading" | "ready" | "error" } {
  const cache = useRef(new Map<string, T>());
  const [value, setValue] = useState<T | undefined>(() =>
    key ? cache.current.get(key) : undefined,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    key ? "loading" : "idle",
  );

  const run = useCallback(
    (nextKey: string | null) => {
      if (!nextKey) {
        setValue(undefined);
        setStatus("idle");
        return;
      }
      const hit = cache.current.get(nextKey);
      if (hit !== undefined) {
        setValue(hit);
        setStatus("ready");
        return;
      }
      const controller = new AbortController();
      setStatus("loading");
      fetcher(nextKey, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          cache.current.set(nextKey, result);
          setValue(result);
          setStatus("ready");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setStatus("error");
        });
      return () => controller.abort();
    },
    [fetcher],
  );

  useEffect(() => run(key), [key, run]);

  return { value, status };
}
