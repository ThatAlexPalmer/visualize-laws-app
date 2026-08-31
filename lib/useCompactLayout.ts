"use client";

import { useEffect, useState } from "react";
import { theme } from "@/lib/theme";

/** True below the `lg` breakpoint — the compact chrome layout. */
export function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${theme.breakpoints.lg})`);
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isCompact;
}
