"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimationControls } from "framer-motion";

import { useExplorer } from "@/lib/store";
import { theme } from "@/lib/theme";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import {
  US_BBOX,
  ZOOM_MS,
  cameraForBBox,
  easeCamera,
  invertCamera,
  lerpCamera,
  type Camera,
} from "./camera";
import {
  joinCountyFills,
  loadCountyFeatures,
  type CountyFeatureEntry,
  type CountyFillPaint,
} from "./counties";
import {
  buildCountyPaths,
  buildStatePaths,
  hoverStrokeFor,
  paintMapBase,
  paintMapOverlay,
  pickAt,
  sameHover,
  type CountyPathEntry,
  type Hovered,
  type Size,
  type StatePathEntry,
} from "./draw";
import { BaseCanvas, MapHud, MapStage, OverlayCanvas } from "./MapChrome";
import { useMapView } from "./MapViewProvider";

// Ignore layout reflows smaller than this (CSS px) before re-fitting.
const SIZE_REFIT_THRESHOLD_PX = 8;

export function MapPanel() {
  const { state, dispatch } = useExplorer();
  const { status, stateDetail, stateDetailStatus } = useJurisdictions();
  const {
    countiesBaked,
    setCountiesBaked,
    fillRows,
    fillByKey,
    sparseCounties,
    domain,
    selectedCounty,
    aggByUsps,
    rows,
    countiesInFlight,
    mapAggregatesInFlight,
  } = useMapView();

  const axis = state.axis;
  const layer = state.layer;
  const hoverStroke = hoverStrokeFor(layer, axis);
  const selectedState = state.selectedState;
  const atlasCountyName = state.atlasCountyName;
  const selectedCity = state.filters.city ?? null;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const statePathsRef = useRef<StatePathEntry[]>([]);
  const countyPathsRef = useRef<CountyPathEntry[]>([]);
  const cameraRef = useRef<Camera>({ k: 1, tx: 0, ty: 0 });
  const tweenRef = useRef<{
    from: Camera;
    to: Camera;
    start: number;
    dur: number;
  } | null>(null);
  const tweenRafRef = useRef<number | null>(null);
  const focusStateRef = useRef<string | null>(null);
  const wantedStateRef = useRef<string | null>(null);
  const drawBaseRef = useRef<() => void>(() => {});
  const drawOverlayRef = useRef<() => void>(() => {});
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const camReadyRef = useRef(false);
  const firstAxisRun = useRef(true);

  const [size, setSize] = useState<Size | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const controls = useAnimationControls();

  const paintByFips = useMemo(() => {
    if (!selectedState || !countiesBaked) {
      return new Map<string, CountyFillPaint>();
    }
    const inState = countyPathsRef.current.filter(
      (c) => c.usps === selectedState,
    );
    return joinCountyFills(
      inState.map((c) => ({ fips: c.fips, name: c.name })),
      fillRows,
    );
  }, [selectedState, countiesBaked, fillRows]);

  const bakeStatePaths = useCallback((): void => {
    if (statePathsRef.current.length > 0) return;
    statePathsRef.current = buildStatePaths();
  }, []);

  const bakeCountyPaths = useCallback(
    (features: CountyFeatureEntry[]): void => {
      if (countyPathsRef.current.length === 0) {
        countyPathsRef.current = buildCountyPaths(features);
      }
      setCountiesBaked(true);
    },
    [setCountiesBaked],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      setSize((prev) => {
        if (!prev) return { w, h, dpr };
        const moved =
          Math.abs(w - prev.w) >= SIZE_REFIT_THRESHOLD_PX ||
          Math.abs(h - prev.h) >= SIZE_REFIT_THRESHOLD_PX;
        return prev.dpr !== dpr || moved ? { w, h, dpr } : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const drawBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas || !size) return;
    paintMapBase({
      canvas,
      size,
      cam: cameraRef.current,
      focus: focusStateRef.current,
      statePaths: statePathsRef.current,
      countyPaths: countyPathsRef.current,
      aggByUsps,
      fillByKey,
      paintByFips,
      domain,
      axis,
      layer,
      sparseCounties,
      mapAggregatesInFlight,
      countiesInFlight,
    });
  }, [
    size,
    aggByUsps,
    fillByKey,
    paintByFips,
    domain,
    axis,
    layer,
    sparseCounties,
    mapAggregatesInFlight,
    countiesInFlight,
  ]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !size) return;
    paintMapOverlay({
      canvas,
      size,
      cam: cameraRef.current,
      focus: focusStateRef.current,
      hovered,
      selectedState,
      selectedCounty,
      selectedCity,
      atlasCountyName,
      hoverStroke,
      statePaths: statePathsRef.current,
      countyPaths: countyPathsRef.current,
      paintByFips,
    });
  }, [
    size,
    hovered,
    selectedState,
    selectedCounty,
    selectedCity,
    atlasCountyName,
    hoverStroke,
    paintByFips,
  ]);

  drawBaseRef.current = drawBase;
  drawOverlayRef.current = drawOverlay;

  const cameraForState = useCallback(
    (usps: string | null, view: Size): Camera => {
      if (!usps) return cameraForBBox(US_BBOX, view.w, view.h);
      const entry = statePathsRef.current.find((s) => s.usps === usps);
      return cameraForBBox(entry?.bbox ?? US_BBOX, view.w, view.h);
    },
    [],
  );

  const startTween = useCallback((to: Camera) => {
    const from = { ...cameraRef.current };
    tweenRef.current = { from, to, start: performance.now(), dur: ZOOM_MS };
    if (tweenRafRef.current != null) return;
    const tick = (now: number) => {
      const tw = tweenRef.current;
      if (!tw) {
        tweenRafRef.current = null;
        return;
      }
      const t = Math.min(1, (now - tw.start) / tw.dur);
      cameraRef.current = lerpCamera(tw.from, tw.to, easeCamera(t));
      drawBaseRef.current();
      drawOverlayRef.current();
      if (t < 1) {
        tweenRafRef.current = requestAnimationFrame(tick);
      } else {
        tweenRef.current = null;
        tweenRafRef.current = null;
      }
    };
    tweenRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    bakeStatePaths();
  }, [bakeStatePaths]);

  // Prefetch the 842 KB atlas after the US map is ready so the first state
  // click is not the download. Idle so it does not contend with first paint.
  useEffect(() => {
    if (status !== "ready" || rows.length === 0 || countiesBaked) return;
    let cancelled = false;
    let idleId = 0;
    let timeoutId = 0;
    const run = () => {
      void loadCountyFeatures()
        .then((features) => {
          if (!cancelled) bakeCountyPaths(features);
        })
        .catch(() => {
          /* first click still loads as a fallback */
        });
    };
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(run);
    } else {
      timeoutId = window.setTimeout(run, 1);
    }
    return () => {
      cancelled = true;
      if (idleId) cancelIdleCallback(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [status, rows.length, countiesBaked, bakeCountyPaths]);

  useEffect(() => {
    if (!selectedState || countiesBaked) return;
    let cancelled = false;
    loadCountyFeatures()
      .then((features) => {
        if (cancelled) return;
        bakeCountyPaths(features);
      })
      .catch(() => {
        /* stay on the US camera */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState, countiesBaked, bakeCountyPaths]);

  useEffect(() => {
    wantedStateRef.current = selectedState;
    if (!size) return;
    if (!camReadyRef.current) {
      cameraRef.current = cameraForState(null, size);
      camReadyRef.current = true;
      if (!selectedState) {
        drawBaseRef.current();
        return;
      }
    }
    if (!selectedState) {
      // Drop the county mesh immediately so zoom-out shows states, not leftover outlines.
      focusStateRef.current = null;
      startTween(cameraForState(null, size));
      return;
    }
    const detailSettled =
      Boolean(stateDetail) || stateDetailStatus === "error";
    const readyToFocus =
      countiesBaked && detailSettled && stateDetailStatus !== "loading";
    if (!readyToFocus) {
      // Mesh before move: stay on the US (or ease back) until Path2Ds are baked
      // and county rows have settled. Do not set focus — that would paint a
      // black county mesh over a solid state fill.
      const wasFocused = focusStateRef.current !== null;
      focusStateRef.current = null;
      if (wasFocused) startTween(cameraForState(null, size));
      return;
    }
    focusStateRef.current = selectedState;
    startTween(cameraForState(selectedState, size));
  }, [
    selectedState,
    countiesBaked,
    size,
    startTween,
    cameraForState,
    stateDetail,
    stateDetailStatus,
  ]);

  useEffect(() => {
    if (!size) return;
    if (tweenRef.current) {
      tweenRef.current.to = cameraForState(wantedStateRef.current, size);
      return;
    }
    cameraRef.current = cameraForState(wantedStateRef.current, size);
    drawBase();
  }, [size, cameraForState, drawBase]);

  useEffect(() => {
    drawBase();
  }, [drawBase]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  useEffect(() => {
    if (firstAxisRun.current) {
      firstAxisRun.current = false;
      return;
    }
    controls.set({ opacity: 0.4 });
    controls.start({
      opacity: 1,
      transition: { duration: theme.motion.base, ease: theme.motion.ease },
    });
  }, [axis, layer, controls]);

  const pick = useCallback(
    (clientX: number, clientY: number): Hovered | null => {
      if (tweenRef.current) return null;
      const canvas = overlayRef.current;
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const rect = canvas.getBoundingClientRect();
      const { wx, wy } = invertCamera(
        cameraRef.current,
        clientX - rect.left,
        clientY - rect.top,
      );
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const found = pickAt(
        ctx,
        wx,
        wy,
        focusStateRef.current,
        countyPathsRef.current,
        statePathsRef.current,
        paintByFips,
      );
      ctx.restore();
      return found;
    },
    [paintByFips],
  );

  const flushHover = useCallback(() => {
    rafRef.current = null;
    const p = pointerRef.current;
    if (!p) return;
    const u = pick(p.x, p.y);
    setHovered((prev) => (sameHover(prev, u) ? prev : u));
  }, [pick]);

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushHover);
      }
    },
    [flushHover],
  );

  const handleLeave = useCallback(() => {
    pointerRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHovered((prev) => (prev === null ? prev : null));
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (tweenRafRef.current != null) cancelAnimationFrame(tweenRafRef.current);
    };
  }, []);

  useEffect(() => {
    setHovered(null);
  }, [selectedState, countiesBaked]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tweenRef.current) return;
      const u = pick(e.clientX, e.clientY);
      const focused = focusStateRef.current;
      if (focused) {
        if (u?.kind === "county") {
          if (u.fillSource === "city" && u.sourcePlace) {
            dispatch({
              type: "selectFocus",
              focus: {
                kind: "city",
                state: focused,
                city: u.sourcePlace,
              },
            });
          } else if (u.countySlug) {
            dispatch({
              type: "selectFocus",
              focus: {
                kind: "county",
                state: focused,
                county: u.countySlug,
              },
            });
          }
          return;
        }
        dispatch({ type: "selectFocus", focus: null });
        return;
      }
      if (!u?.usps) return;
      dispatch({
        type: "selectState",
        state: u.usps === selectedState ? null : u.usps,
      });
    },
    [pick, dispatch, selectedState],
  );

  return (
    <MapStage ref={wrapRef}>
      <BaseCanvas ref={baseRef} animate={controls} />
      <OverlayCanvas
        ref={overlayRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        style={{
          cursor:
            hovered?.kind === "county"
              ? hovered.sourcePlace
                ? "pointer"
                : "default"
              : hovered
                ? "pointer"
                : "default",
        }}
      />
      <MapHud hovered={hovered} />
    </MapStage>
  );
}
