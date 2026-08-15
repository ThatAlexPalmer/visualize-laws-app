"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { geoAlbersUsa, geoPath } from "d3-geo";

import { useExplorer } from "@/lib/store";
import { theme } from "@/lib/theme";
import {
  matchCountySlug,
  prettySlug,
  stateName,
  type Axis,
  type JurisdictionAgg,
} from "@/lib/types";
import { resolveAxisCopy } from "@/lib/copy";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import { stateFeatureCollection, stateFeatures } from "./geo";
import { uspsToFips } from "./fips";
import {
  countiesForState,
  joinCountySlugs,
  loadCountyFeatures,
  type CountyFeatureEntry,
} from "./counties";
import {
  axisValue,
  computeDomain,
  normalize,
  rampColorForAxis,
  type Domain,
} from "./color";
import { MapLegend } from "./Legend";

interface PathEntry {
  kind: "state" | "county";
  usps: string | null;
  path: Path2D;
  countyFips?: string;
  countySlug?: string | null;
  countyName?: string;
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
const StateLabel = styled(motion.div)`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  left: ${({ theme }) => theme.space(4)};
  z-index: 3;
  pointer-events: none;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.fg};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    top: ${({ theme }) => theme.space(3)};
    left: ${({ theme }) => theme.space(3)};
    font-size: ${({ theme }) => theme.fontSize.lg};
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

export function MapPanel() {
  const { state, dispatch } = useExplorer();
  const { data, status, retry, stateDetail } = useJurisdictions();
  const axis = state.axis;
  const selectedState = state.selectedState;
  const selectedCountyRaw = state.filters.county ?? null;
  const rows = data?.rows ?? EMPTY_ROWS;
  const countyRows = stateDetail?.counties ?? EMPTY_ROWS;
  const selectedCounty = selectedCountyRaw
    ? (matchCountySlug(countyRows, selectedCountyRaw) ?? selectedCountyRaw)
    : null;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pathsRef = useRef<PathEntry[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [size, setSize] = useState<Size | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [countyAtlas, setCountyAtlas] = useState<CountyFeatureEntry[] | null>(
    null,
  );
  const [pathGen, setPathGen] = useState(0);

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

  const countyViewReady = Boolean(
    selectedState && countyAtlas && stateDetail,
  );

  // State view: min/max of state averages. Zoomed county view: min/max of
  // in-state county averages (no national bounds — same as the US map).
  const domain: Domain | null = useMemo(
    () => computeDomain(axis, countyViewReady ? countyRows : rows),
    [axis, countyViewReady, countyRows, rows],
  );

  // First state click lazy-loads county geometry (kept out of the initial bundle).
  useEffect(() => {
    if (!selectedState || countyAtlas) return;
    let cancelled = false;
    loadCountyFeatures()
      .then((features) => {
        if (!cancelled) setCountyAtlas(features);
      })
      .catch(() => {
        /* atlas missing — stay on the zoomed state silhouette */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState, countyAtlas]);

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
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.colors.bg;
    ctx.fillRect(0, 0, w, h);

    const entries = pathsRef.current;

    // 1) fills, colored by the selected axis (faint silhouette when no data)
    for (const e of entries) {
      const agg =
        e.kind === "county"
          ? e.countySlug
            ? aggByCountySlug.get(e.countySlug)
            : undefined
          : e.usps
            ? aggByUsps.get(e.usps)
            : undefined;
      ctx.fillStyle =
        agg && domain
          ? rampColorForAxis(normalize(axisValue(agg, axis), domain), axis)
          : "rgba(255,255,255,0.015)";
      ctx.fill(e.path);
    }

    // 2) base separators — 1px white at 0.32 stays visible over both near-black
    // dark fills and vivid saturated fills across all axis color ramps.
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    for (const e of entries) ctx.stroke(e.path);
  }, [size, aggByUsps, aggByCountySlug, domain, axis]);

  // --- overlay layer: hover highlight + active selection --------------------
  // Transparent; cleared and repainted on its own. Only the hovered + selected
  // state outlines are stroked, so a hover change is a couple of strokes.
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    syncCanvasSize(canvas, size);
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const entries = pathsRef.current;
    ctx.lineJoin = "round";

    // hover highlight (skip when it coincides with the selection stroke)
    const hoverIsSelection =
      hovered?.kind === "county"
        ? Boolean(hovered.countySlug && hovered.countySlug === selectedCounty)
        : Boolean(
            hovered?.usps && hovered.usps === selectedState && !selectedCounty,
          );
    if (hovered && !hoverIsSelection) {
      const hoverEntry =
        hovered.kind === "county"
          ? entries.find(
              (e) =>
                e.kind === "county" &&
                (hovered.countySlug
                  ? e.countySlug === hovered.countySlug
                  : e.countyName === hovered.countyName),
            )
          : entries.find((e) => e.kind === "state" && e.usps === hovered.usps);
      if (hoverEntry) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = AXIS_HOVER_STROKE[axis];
        ctx.stroke(hoverEntry.path);
      }
    }

    // active selection (drawn last, on top)
    if (selectedCounty) {
      const se = entries.find(
        (e) => e.kind === "county" && e.countySlug === selectedCounty,
      );
      if (se) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.colors.fg;
        ctx.stroke(se.path);
      }
    } else if (selectedState) {
      const se = entries.find((e) => e.kind === "state" && e.usps === selectedState);
      if (se) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.colors.fg;
        ctx.stroke(se.path);
      }
    }
  }, [size, hovered, selectedState, selectedCounty, axis]);

  // Rebuild Path2Ds whenever the canvas size or zoom target changes.
  // Paths are regenerated at the new scale (not interpolated).
  useEffect(() => {
    if (!size) return;
    const { w, h } = size;
    const pad = Math.round(Math.min(w, h) * 0.04) + 6;
    const x1 = Math.max(pad + 1, w - pad);
    const y1 = Math.max(pad + 1, h - pad);

    const stateEntry = selectedState
      ? stateFeatures.find((f) => f.usps === selectedState)
      : undefined;
    const fitTarget =
      selectedState && stateEntry ? stateEntry.geo : stateFeatureCollection;
    const projection = geoAlbersUsa().fitExtent(
      [
        [pad, pad],
        [x1, y1],
      ],
      fitTarget,
    );
    const pathGen = geoPath(projection);
    const entries: PathEntry[] = [];

    if (countyViewReady && countyAtlas && stateEntry) {
      const stateFips = stateEntry.fips || uspsToFips[selectedState ?? ""];
      const inState = countiesForState(countyAtlas, stateFips);
      const fipsToSlug = joinCountySlugs(inState, countyRows);
      for (const f of inState) {
        const d = pathGen(f.geo);
        if (!d) continue;
        entries.push({
          kind: "county",
          usps: selectedState,
          path: new Path2D(d),
          countyFips: f.fips,
          countySlug: fipsToSlug.get(f.fips) ?? null,
          countyName: f.name,
        });
      }
    } else {
      const source = selectedState && stateEntry ? [stateEntry] : stateFeatures;
      for (const f of source) {
        const d = pathGen(f.geo);
        if (!d) continue;
        entries.push({ kind: "state", usps: f.usps, path: new Path2D(d) });
      }
    }
    pathsRef.current = entries;
    setPathGen((n) => n + 1);
  }, [size, selectedState, countyViewReady, countyAtlas, countyRows]);

  // Repaint the base only when its inputs change (size/paths, data, axis). The
  // path-rebuild effect above runs first on a size change, so paths are fresh.
  useEffect(() => {
    drawBase();
  }, [drawBase, pathGen]);

  // Repaint the lightweight overlay only when the hover/selection changes.
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay, pathGen]);

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
  }, [axis, selectedState, countyViewReady, controls]);

  // --- interaction: hit-test in CSS px under an identity transform ----------
  const pick = useCallback((clientX: number, clientY: number): Hovered | null => {
    const canvas = overlayRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let found: Hovered | null = null;
    for (const e of pathsRef.current) {
      if (ctx.isPointInPath(e.path, x, y)) {
        found =
          e.kind === "county"
            ? {
                kind: "county",
                usps: e.usps,
                countySlug: e.countySlug ?? null,
                countyName: e.countyName,
              }
            : { kind: "state", usps: e.usps };
        break;
      }
    }
    ctx.restore();
    return found;
  }, []);

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
    };
  }, []);

  // Drop hover when the path set changes so a county name cannot stick on the US map.
  useEffect(() => {
    setHovered(null);
  }, [selectedState, countyViewReady, pathGen]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const u = pick(e.clientX, e.clientY);
      if (selectedState) {
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

  const { unhinged } = state;
  const axisCopy = resolveAxisCopy(axis, unhinged);
  const mapLabel = hovered
    ? hovered.kind === "county"
      ? (hovered.countyName ?? prettySlug(hovered.countySlug) ?? stateName(hovered.usps))
      : stateName(hovered.usps)
    : selectedCounty
      ? prettySlug(selectedCounty)
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
      <MapLegend axis={axis} axisLabel={axisCopy.label} blurb={axisCopy.blurb} domain={domain} />
      <AnimatePresence>
        {mapLabel && (
          <StateLabel
            key={mapLabel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {mapLabel}
          </StateLabel>
        )}
      </AnimatePresence>
    </Wrap>
  );
}
