"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { motion, useAnimationControls } from "framer-motion";
import { geoPath } from "d3-geo";

import { useExplorer } from "@/lib/store";
import { theme } from "@/lib/theme";
import {
  matchCountySlug,
  normalizePlaceKey,
  prettySlug,
  stateName,
  type Axis,
  type JurisdictionAgg,
} from "@/lib/types";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import { stateFeatures, usProjection } from "./geo";
import { fipsToUsps } from "./fips";
import {
  joinCountySlugs,
  loadCountyFeatures,
  type CountyFeatureEntry,
} from "./counties";
import {
  US_BBOX,
  ZOOM_MS,
  boundsToBBox,
  cameraForBBox,
  easeCamera,
  invertCamera,
  lerpCamera,
  type Camera,
  type WorldBBox,
} from "./camera";
import {
  axisValue,
  computeDomain,
  normalize,
  rampColorForAxis,
  type Domain,
} from "./color";
import {
  COUNTY_FILL_MIN,
  countyScaleReady,
  formatSparseCountyCopy,
} from "./sparseCounties";

interface StatePathEntry {
  usps: string | null;
  path: Path2D;
  bbox: WorldBBox;
}

interface CountyPathEntry {
  fips: string;
  stateFips: string;
  usps: string | null;
  name: string;
  path: Path2D;
  bbox: WorldBBox;
}

interface Hovered {
  kind: "state" | "county";
  usps: string | null;
  countySlug?: string | null;
  countyName?: string;
}

function sameHover(a: Hovered | null, b: Hovered | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.usps === b.usps &&
    a.countySlug === b.countySlug &&
    a.countyName === b.countyName
  );
}

interface Size {
  w: number;
  h: number;
  dpr: number;
}

// Ignore layout reflows smaller than this (CSS px) before re-fitting the
// projection — defense-in-depth so a scrollbar/sub-pixel jitter can't shift the
// map. Genuine resizes (>= threshold) and any devicePixelRatio change still fit.
const SIZE_REFIT_THRESHOLD_PX = 8;

const Wrap = styled.div`
  position: relative;
  width: 100%;
  height: clamp(360px, 44vh, 520px);
  min-height: 360px;
  /* The map is a flex child of the scrolling <Main> column. Without this it
     keeps the default flex-shrink: 1, so when selecting a state grows the
     panels below (results + jurisdiction) the flexbox shrinks this box between
     56vh and 420px to fit. That height change fires the ResizeObserver, re-fits
     the projection, and clears the base canvas — the flicker/jump on click.
     Locking flex-shrink pins the map height; the panels overflow into <Main>'s
     scroll area instead, so a selection never resizes the canvas. */
  flex-shrink: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
  z-index: ${({ theme }) => theme.z.map};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    height: min(52dvh, 480px);
    min-height: 380px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    min-height: 340px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) and (max-height: 500px) {
    height: 300px;
    min-height: 300px;
  }
`;

const RetryHint = styled(motion.button)`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  right: ${({ theme }) => theme.space(4)};
  z-index: 4;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g60};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    display: none;
  }
`;

const EMPTY_ROWS: JurisdictionAgg[] = [];

// Base layer: opaque state fills + base separators. Repainted ONLY when the
// size / axis / domain / aggregate data change — never on hover or selection.
const BaseCanvas = styled(motion.canvas)`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
`;

// Overlay layer: transparent canvas stacked directly on top. Draws only the
// hover highlight + active-selection stroke, so pointer activity repaints just
// this (cheap) layer while the base fills are left untouched.
const OverlayCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
`;

/** Per-axis tinted hover stroke colors. */
const AXIS_HOVER_STROKE: Record<Axis, string> = {
  opacity: "rgba(229,62,62,0.72)",
  enforcementDiscretion: "rgba(59,130,246,0.72)",
  paternalism: "rgba(249,115,22,0.72)",
  problemSalience: "rgba(139,92,246,0.72)",
};

/** State name displayed on top-left of the map canvas. */
const TitleStack = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  left: ${({ theme }) => theme.space(4)};
  z-index: 3;
  max-width: min(420px, calc(100% - 48px));
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(1.5)};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    top: ${({ theme }) => theme.space(3)};
    left: ${({ theme }) => theme.space(3)};
  }
`;

const StateLabel = styled.div`
  min-height: 1.15em;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.fg};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    font-size: ${({ theme }) => theme.fontSize.lg};
  }
`;

const SparseLine = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.04em;
  line-height: 1.4;
  text-transform: none;
  color: ${({ theme }) => theme.colors.g68};
`;

const SparseChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space(1)};
  pointer-events: auto;
`;

const SparseChip = styled.button<{ $active: boolean }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.g60 : theme.colors.g20)};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.g12 : "transparent"};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(0.75)} ${({ theme }) => theme.space(1.5)};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.fg : theme.colors.g90};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
    border-color: ${({ theme }) => theme.colors.g60};
  }
`;

const Hint = styled(motion.div)`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  right: ${({ theme }) => theme.space(4)};
  z-index: 3;
  pointer-events: none;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g60};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    display: none;
  }
`;

/** Size a canvas backing store to its DPR-scaled pixel box (clears on change). */
function syncCanvasSize(canvas: HTMLCanvasElement, size: Size): void {
  const bw = Math.round(size.w * size.dpr);
  const bh = Math.round(size.h * size.dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
}

function beginWorldFrame(
  ctx: CanvasRenderingContext2D,
  size: Size,
  cam: Camera,
): void {
  const { dpr } = size;
  ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.tx, dpr * cam.ty);
}

export function MapPanel({
  onCountiesBaked,
}: {
  onCountiesBaked?: (baked: boolean) => void;
}) {
  const { state, dispatch } = useExplorer();
  const { data, status, retry, stateDetail, stateDetailStatus } =
    useJurisdictions();
  const axis = state.axis;
  const selectedState = state.selectedState;
  const atlasCountyName = state.atlasCountyName;
  const selectedCountyRaw = state.filters.county ?? null;
  const selectedCity = state.filters.city ?? null;
  const rows = data?.rows ?? EMPTY_ROWS;
  const countyRows = stateDetail?.counties ?? EMPTY_ROWS;
  const selectedCounty = selectedCountyRaw
    ? (matchCountySlug(countyRows, selectedCountyRaw) ?? selectedCountyRaw)
    : null;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const statePathsRef = useRef<StatePathEntry[]>([]);
  const countyPathsRef = useRef<CountyPathEntry[]>([]);
  const pathBakeCountRef = useRef(0);
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

  const [size, setSize] = useState<Size | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [countiesBaked, setCountiesBaked] = useState(false);

  useEffect(() => {
    onCountiesBaked?.(countiesBaked);
  }, [countiesBaked, onCountiesBaked]);

  const controls = useAnimationControls();
  const firstAxisRun = useRef(true);
  // All map, rail, and filter consumers share the provider's response.
  const aggByUsps = useMemo(() => {
    const m = new Map<string, JurisdictionAgg>();
    for (const r of rows) if (r.state) m.set(r.state.toLowerCase(), r);
    return m;
  }, [rows]);

  const aggByCountySlug = useMemo(() => {
    const m = new Map<string, JurisdictionAgg>();
    for (const r of countyRows) if (r.county) m.set(r.county.toLowerCase(), r);
    return m;
  }, [countyRows]);

  const fipsToSlug = useMemo(() => {
    if (!selectedState || !countiesBaked) return new Map<string, string>();
    const inState = countyPathsRef.current.filter((c) => c.usps === selectedState);
    const asFeatures: CountyFeatureEntry[] = inState.map((c) => ({
      fips: c.fips,
      stateFips: c.stateFips,
      name: c.name,
      geo: c.path as unknown as CountyFeatureEntry["geo"],
    }));
    return joinCountySlugs(asFeatures, countyRows);
  }, [selectedState, countiesBaked, countyRows]);

  const countyViewReady = countyScaleReady({
    selectedState,
    stateDetail,
    countiesBaked,
  });

  const scoredCounties = useMemo(
    () => countyRows.filter((r) => r.county),
    [countyRows],
  );
  const scoredCountyN = scoredCounties.length;
  // US aggregates still in flight — do not present the faint mesh as finished.
  const mapAggregatesInFlight = status === "loading" && rows.length === 0;
  // Atlas and/or county rows still in flight. Sparse copy waits until settle.
  const countiesInFlight =
    Boolean(selectedState) &&
    stateDetailStatus !== "error" &&
    (!countiesBaked || !stateDetail || stateDetailStatus === "loading");
  const sparseCounties =
    !countiesInFlight &&
    Boolean(selectedState && stateDetail && stateDetailStatus === "ready") &&
    scoredCountyN < COUNTY_FILL_MIN;
  const loadingLine =
    countiesInFlight && selectedState
      ? `Loading counties in ${stateName(selectedState)}.`
      : mapAggregatesInFlight
        ? "Loading the map."
        : null;
  const sparseCopy = useMemo(() => {
    if (!sparseCounties || !selectedState) return null;
    const names = scoredCounties
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b));
    return formatSparseCountyCopy(stateName(selectedState), names);
  }, [sparseCounties, selectedState, scoredCounties]);

  // State view: min/max of state averages. Zoomed county view: min/max of
  // in-state county averages (no national bounds — same as the US map).
  const domain: Domain | null = useMemo(
    () =>
      computeDomain(
        axis,
        countyViewReady && !sparseCounties ? countyRows : rows,
      ),
    [axis, countyViewReady, sparseCounties, countyRows, rows],
  );

  const bakeStatePaths = useCallback((): void => {
    if (statePathsRef.current.length > 0) return;
    const gen = geoPath(usProjection);
    const baked: StatePathEntry[] = [];
    for (const f of stateFeatures) {
      const d = gen(f.geo);
      if (!d) continue;
      baked.push({
        usps: f.usps,
        path: new Path2D(d),
        bbox: boundsToBBox(gen.bounds(f.geo)),
      });
    }
    statePathsRef.current = baked;
    pathBakeCountRef.current += 1;
  }, []);

  const bakeCountyPaths = useCallback((features: CountyFeatureEntry[]): void => {
    if (countyPathsRef.current.length > 0) return;
    const gen = geoPath(usProjection);
    const baked: CountyPathEntry[] = [];
    for (const f of features) {
      const d = gen(f.geo);
      if (!d) continue;
      baked.push({
        fips: f.fips,
        stateFips: f.stateFips,
        usps: fipsToUsps[f.stateFips] ?? null,
        name: f.name,
        path: new Path2D(d),
        bbox: boundsToBBox(gen.bounds(f.geo)),
      });
    }
    countyPathsRef.current = baked;
    pathBakeCountRef.current += 1;
    setCountiesBaked(true);
  }, []);

  // --- size + devicePixelRatio via ResizeObserver ---------------------------
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
        // Re-fit on any DPR change (crispness); otherwise only when the box
        // moved by >= the threshold, so tiny reflows never shift the map.
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

  // --- base layer: opaque fills + separators --------------------------------
  // Deps deliberately EXCLUDE hovered / selectedState, so pointer activity can
  // never trigger a base repaint — this is what eliminates the hover flicker.
  const drawBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    syncCanvasSize(canvas, size);
    const cam = cameraRef.current;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.colors.bg;
    ctx.fillRect(0, 0, w, h);
    beginWorldFrame(ctx, size, cam);

    const lw = 1 / cam.k;
    const focus = focusStateRef.current;

    for (const e of statePathsRef.current) {
      const agg = e.usps ? aggByUsps.get(e.usps) : undefined;
      ctx.fillStyle =
        agg && domain
          ? rampColorForAxis(normalize(axisValue(agg, axis), domain), axis)
          : mapAggregatesInFlight
            ? "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.015)";
      ctx.fill(e.path);
    }
    ctx.lineJoin = "round";
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    for (const e of statePathsRef.current) ctx.stroke(e.path);

    // In-flight state view is a flat wash + loading line, not a county mesh.
    if (focus && !countiesInFlight) {
      const focusedState = statePathsRef.current.find((e) => e.usps === focus);
      // Cover the focused state's choropleth so unscored counties stay unpainted
      // (a 1.5% white wash over the state fill still reads as "colored").
      if (focusedState) {
        ctx.fillStyle = theme.colors.bg;
        ctx.fill(focusedState.path);
      }
      const inState = countyPathsRef.current.filter((c) => c.usps === focus);
      if (!sparseCounties) {
        for (const e of inState) {
          const slug = fipsToSlug.get(e.fips);
          const agg = slug ? aggByCountySlug.get(slug) : undefined;
          if (!agg || !domain) continue;
          ctx.fillStyle = rampColorForAxis(
            normalize(axisValue(agg, axis), domain),
            axis,
          );
          ctx.fill(e.path);
        }
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      for (const e of inState) ctx.stroke(e.path);
    }
  }, [
    size,
    aggByUsps,
    aggByCountySlug,
    fipsToSlug,
    domain,
    axis,
    sparseCounties,
    mapAggregatesInFlight,
    countiesInFlight,
  ]);

  // --- overlay layer: hover highlight + active selection --------------------
  // Transparent; cleared and repainted on its own. Only the hovered + selected
  // state outlines are stroked, so a hover change is a couple of strokes.
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    syncCanvasSize(canvas, size);
    const cam = cameraRef.current;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    beginWorldFrame(ctx, size, cam);
    ctx.lineJoin = "round";
    const focus = focusStateRef.current;

    const hoverIsSelection =
      hovered?.kind === "county"
        ? Boolean(hovered.countySlug && hovered.countySlug === selectedCounty)
        : Boolean(
            hovered?.usps && hovered.usps === selectedState && !selectedCounty,
          );
    if (hovered && !hoverIsSelection) {
      if (hovered.kind === "county" && focus) {
        const hoverEntry = countyPathsRef.current.find(
          (e) =>
            e.usps === focus &&
            (hovered.countySlug
              ? fipsToSlug.get(e.fips) === hovered.countySlug
              : e.name === hovered.countyName),
        );
        if (hoverEntry) {
          ctx.lineWidth = 1.5 / cam.k;
          ctx.strokeStyle = AXIS_HOVER_STROKE[axis];
          ctx.stroke(hoverEntry.path);
        }
      } else if (hovered.kind === "state") {
        const hoverEntry = statePathsRef.current.find(
          (e) => e.usps === hovered.usps,
        );
        if (hoverEntry) {
          ctx.lineWidth = 1.5 / cam.k;
          ctx.strokeStyle = AXIS_HOVER_STROKE[axis];
          ctx.stroke(hoverEntry.path);
        }
      }
    }

    if ((selectedCounty || atlasCountyName) && focus) {
      const se = countyPathsRef.current.find((e) => {
        if (e.usps !== focus) return false;
        const slug = fipsToSlug.get(e.fips);
        if (selectedCounty && slug === selectedCounty) return true;
        if (
          atlasCountyName &&
          normalizePlaceKey(e.name) === normalizePlaceKey(atlasCountyName)
        ) {
          return true;
        }
        return false;
      });
      if (se) {
        ctx.lineWidth = 2 / cam.k;
        ctx.strokeStyle = theme.colors.fg;
        ctx.stroke(se.path);
      }
    } else if (selectedState && !focus) {
      const se = statePathsRef.current.find((e) => e.usps === selectedState);
      if (se) {
        ctx.lineWidth = 2 / cam.k;
        ctx.strokeStyle = theme.colors.fg;
        ctx.stroke(se.path);
      }
    }
  }, [
    size,
    hovered,
    selectedState,
    selectedCounty,
    atlasCountyName,
    axis,
    fipsToSlug,
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

  const camReadyRef = useRef(false);

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

  // framer-motion crossfade when the active axis changes (skip initial mount).
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
  }, [axis, controls]);

  // Hit-test in world space: invert the camera, then isPointInPath on baked paths.
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
      const focus = focusStateRef.current;
      let found: Hovered | null = null;
      if (focus) {
        for (const e of countyPathsRef.current) {
          if (e.usps !== focus) continue;
          if (ctx.isPointInPath(e.path, wx, wy)) {
            found = {
              kind: "county",
              usps: e.usps,
              countySlug: fipsToSlug.get(e.fips) ?? null,
              countyName: e.name,
            };
            break;
          }
        }
      } else {
        for (const e of statePathsRef.current) {
          if (ctx.isPointInPath(e.path, wx, wy)) {
            found = { kind: "state", usps: e.usps };
            break;
          }
        }
      }
      ctx.restore();
      return found;
    },
    [fipsToSlug],
  );

  // Coalesce mousemoves: store the latest pointer and hit-test at most once per
  // animation frame, updating `hovered` only when the picked state changes.
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

  // Cancel any pending hover frame on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (tweenRafRef.current != null) cancelAnimationFrame(tweenRafRef.current);
    };
  }, []);

  // Drop hover when the path set changes so a county name cannot stick on the US map.
  useEffect(() => {
    setHovered(null);
  }, [selectedState, countiesBaked]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Mid-tween hits are sloppy (overlapping Albers neighbors). Ignore.
      if (tweenRef.current) return;
      const u = pick(e.clientX, e.clientY);
      const focused = focusStateRef.current;
      if (focused) {
        // Zoomed: a colored county sets the county filter. Uncolored counties
        // are unclickable. Only a miss (ocean / outside the state) zooms out.
        if (u?.kind === "county") {
          if (u.countySlug) {
            dispatch({
              type: "patchFilters",
              filters: { county: u.countySlug },
            });
          }
          return;
        }
        dispatch({ type: "selectState", state: null });
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

  const hoveredCountyLabel = hovered?.kind === "county"
    ? (hovered.countyName ?? prettySlug(hovered.countySlug) ?? stateName(hovered.usps))
    : null;
  const hoveredHasScore = Boolean(
    hovered?.kind === "county" &&
      hovered.countySlug &&
      aggByCountySlug.has(hovered.countySlug),
  );
  const mapLabel = hovered
    ? hovered.kind === "county"
      ? hoveredHasScore
        ? hoveredCountyLabel
        : `${hoveredCountyLabel} · no data`
      : stateName(hovered.usps)
    : selectedCounty
      ? prettySlug(selectedCounty)
      : atlasCountyName
        ? atlasCountyName
        : selectedCity
          ? prettySlug(selectedCity)
          : selectedState
            ? stateName(selectedState)
            : null;

  return (
    <Wrap ref={wrapRef}>
      <BaseCanvas ref={baseRef} animate={controls} />
      <OverlayCanvas
        ref={overlayRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        style={{
          cursor:
            hovered?.kind === "county"
              ? hovered.countySlug
                ? "pointer"
                : "default"
              : hovered
                ? "pointer"
                : "default",
        }}
      />
      {status === "ready" && rows.length === 0 && (
        <Hint
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: theme.motion.slow }}
        >
          no map data
        </Hint>
      )}
      {status === "error" && (
        <RetryHint
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: theme.motion.slow }}
          onClick={retry}
        >
          map unavailable · retry
        </RetryHint>
      )}
      <TitleStack>
        <StateLabel>{mapLabel ?? ""}</StateLabel>
        {loadingLine && <SparseLine>{loadingLine}</SparseLine>}
        {!loadingLine && sparseCopy && (
          <SparseLine>{sparseCopy.line}</SparseLine>
        )}
        {!loadingLine && sparseCopy && sparseCopy.chipNames.length > 0 && (
          <SparseChips>
            {scoredCounties
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((row) => {
                const slug = row.county;
                if (!slug) return null;
                const active = selectedCounty === slug;
                return (
                  <SparseChip
                    key={slug}
                    type="button"
                    $active={active}
                    onClick={() =>
                      dispatch({
                        type: "patchFilters",
                        filters: { county: slug },
                      })
                    }
                  >
                    {row.name}
                  </SparseChip>
                );
              })}
          </SparseChips>
        )}
      </TitleStack>
    </Wrap>
  );
}
