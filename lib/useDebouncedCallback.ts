"use client";

import { useEffect, useRef } from "react";

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<A | null>(null);

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingArgsRef.current = null;
  };

  const run = (...args: A) => {
    cancel();
    pendingArgsRef.current = args;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingArgsRef.current = null;
      callbackRef.current(...args);
    }, delay);
  };

  const flush = (...fallbackArgs: A) => {
    const args = pendingArgsRef.current ?? fallbackArgs;
    cancel();
    callbackRef.current(...args);
  };

  useEffect(() => cancel, []);

  return { run, cancel, flush };
}
