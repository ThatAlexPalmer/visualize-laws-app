"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { motion, useAnimationControls } from "framer-motion";
import { geoAlbersUsa, geoPath } from "d3-geo";

import { useExplorer } from "@/lib/store";
import { theme } from "@/lib/theme";
import {
  AXIS_BY_KEY,
  type AxisBounds,
  type JurisdictionAgg,
  type JurisdictionsResponse,
} from "@/lib/types";

import { stateFeatureCollection, stateFeatures } from "./geo";
import {
  axisValue,
  computeDomain,
  normalize,
  rampColor,
  type Domain,
} from "./color";
import { MapLegend } from "./Legend";

interface PathEntry {
  usps: string | null;
  path: Path2D;
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
  height: 56vh;
  min-height: 420px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
  z-index: ${({ theme }) => theme.z.map};
`;

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
  color: ${({ theme }) => theme.colors.g32};
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
  const axis = state.axis;
  const selectedState = state.selectedState;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pathsRef = useRef<PathEntry[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [size, setSize] = useState<Size | null>(null);
  const [rows, setRows] = useState<JurisdictionAgg[]>([]);
  const [national, setNational] =
    useState<(JurisdictionAgg & { bounds?: AxisBounds }) | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const controls = useAnimationControls();
  const firstAxisRun = useRef(true);

  // --- data: jurisdiction aggregates (tolerant of empty / failed responses) --
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jurisdictions");
        if (!res.ok) return;
        const json: JurisdictionsResponse = await res.json();
        if (cancelled) return;
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setNational(json.national ?? null);
      } catch {
        // Leave rows empty; the outline map still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aggByUsps = useMemo(() => {
    const m = new Map<string, JurisdictionAgg>();
    for (const r of rows) if (r.state) m.set(r.state.toLowerCase(), r);
    return m;
  }, [rows]);

  const domain: Domain | null = useMemo(
    () => computeDomain(axis, rows, national?.bounds),
    [axis, rows, national],
  );

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
      const agg = e.usps ? aggByUsps.get(e.usps) : undefined;
      ctx.fillStyle =
        agg && domain
          ? rampColor(normalize(axisValue(agg, axis), domain))
          : "rgba(255,255,255,0.015)";
      ctx.fill(e.path);
    }

    // 2) base separators
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    for (const e of entries) ctx.stroke(e.path);
  }, [size, aggByUsps, domain, axis]);

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
    if (hovered && hovered !== selectedState) {
      const he = entries.find((e) => e.usps === hovered);
      if (he) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.stroke(he.path);
      }
    }

    // active selection (drawn last, on top)
    if (selectedState) {
      const se = entries.find((e) => e.usps === selectedState);
      if (se) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.colors.fg;
        ctx.stroke(se.path);
      }
    }
  }, [size, hovered, selectedState]);

  // Rebuild the per-state Path2D set whenever the canvas size changes.
  useEffect(() => {
    if (!size) return;
    const { w, h } = size;
    const pad = Math.round(Math.min(w, h) * 0.04) + 6;
    const x1 = Math.max(pad + 1, w - pad);
    const y1 = Math.max(pad + 1, h - pad);
    const projection = geoAlbersUsa().fitExtent(
      [
        [pad, pad],
        [x1, y1],
      ],
      stateFeatureCollection,
    );
    const pathGen = geoPath(projection);
    const entries: PathEntry[] = [];
    for (const f of stateFeatures) {
      const d = pathGen(f.geo);
      if (!d) continue;
      entries.push({ usps: f.usps, path: new Path2D(d) });
    }
    pathsRef.current = entries;
  }, [size]);

  // Repaint the base only when its inputs change (size/paths, data, axis). The
  // path-rebuild effect above runs first on a size change, so paths are fresh.
  useEffect(() => {
    drawBase();
  }, [drawBase]);

  // Repaint the lightweight overlay only when the hover/selection changes.
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

  // --- interaction: hit-test in CSS px under an identity transform ----------
  const pick = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = overlayRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let found: string | null = null;
    for (const e of pathsRef.current) {
      if (e.usps && ctx.isPointInPath(e.path, x, y)) {
        found = e.usps;
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
    setHovered((prev) => (prev === u ? prev : u));
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

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const u = pick(e.clientX, e.clientY);
      if (!u) return;
      dispatch({ type: "selectState", state: u === selectedState ? null : u });
    },
    [pick, dispatch, selectedState],
  );

  const axisMeta = AXIS_BY_KEY[axis];

  return (
    <Wrap ref={wrapRef}>
      <BaseCanvas ref={baseRef} animate={controls} />
      <OverlayCanvas
        ref={overlayRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        style={{ cursor: hovered ? "pointer" : "default" }}
      />
      {rows.length === 0 && (
        <Hint
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: theme.motion.slow }}
        >
          awaiting aggregates
        </Hint>
      )}
      <MapLegend axisLabel={axisMeta.label} blurb={axisMeta.blurb} domain={domain} />
    </Wrap>
  );
}
