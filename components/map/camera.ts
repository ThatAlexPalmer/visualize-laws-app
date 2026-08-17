import { theme } from "@/lib/theme";
import { WORLD } from "./geo";

export interface Camera {
  k: number;
  tx: number;
  ty: number;
}

export interface WorldBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const US_BBOX: WorldBBox = {
  x: 0,
  y: 0,
  w: WORLD.w,
  h: WORLD.h,
};

export const ZOOM_MS = Math.round(theme.motion.base * 1000);

export function boundsToBBox(bounds: [[number, number], [number, number]]): WorldBBox {
  const [[x0, y0], [x1, y1]] = bounds;
  return { x: x0, y: y0, w: Math.max(1e-6, x1 - x0), h: Math.max(1e-6, y1 - y0) };
}

/** Map a world bbox into the current CSS view. */
export function cameraForBBox(
  bbox: WorldBBox,
  viewW: number,
  viewH: number,
): Camera {
  const pad = Math.round(Math.min(viewW, viewH) * 0.04) + 6;
  const availW = Math.max(1, viewW - 2 * pad);
  const availH = Math.max(1, viewH - 2 * pad);
  const k = Math.min(availW / bbox.w, availH / bbox.h);
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  return { k, tx: viewW / 2 - k * cx, ty: viewH / 2 - k * cy };
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    k: a.k + (b.k - a.k) * t,
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
  };
}

/** Cubic-bezier Y for x=t on theme.motion.ease (x1,y1,x2,y2). */
export function easeCamera(t: number): number {
  const [x1, y1, x2, y2] = theme.motion.ease;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const x = sampleBezier(u, x1, x2);
    const dx = sampleBezierDeriv(u, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - t) / dx;
    if (u < 0 || u > 1) break;
  }
  u = Math.max(0, Math.min(1, u));
  return sampleBezier(u, y1, y2);
}

function sampleBezier(u: number, c1: number, c2: number): number {
  const u2 = 1 - u;
  return 3 * u2 * u2 * u * c1 + 3 * u2 * u * u * c2 + u * u * u;
}

function sampleBezierDeriv(u: number, c1: number, c2: number): number {
  const u2 = 1 - u;
  return 3 * u2 * u2 * c1 + 6 * u2 * u * (c2 - c1) + 3 * u * u * (1 - c2);
}

export function invertCamera(cam: Camera, x: number, y: number): { wx: number; wy: number } {
  return { wx: (x - cam.tx) / cam.k, wy: (y - cam.ty) / cam.k };
}
