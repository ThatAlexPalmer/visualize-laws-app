"use client";

// Four scoring axes plus the fines layer. `pills` is the desktop nav; `sheet`
// is the compact 2-column grid. Selection callbacks stay in TopNav.
import styled from "styled-components";
import type { ReactNode } from "react";
import { AXES, type Axis, type MapLayer } from "@/lib/types";
import { theme } from "@/lib/theme";
import { resolveAxisCopy, resolveFinesCopy } from "@/lib/copy";
import { Mono } from "@/components/ui/text";
import { PillHighlight } from "@/components/ui/forms";

const AXIS_ACCENT: Record<Axis, string> = theme.colors.axis;

export interface LayerPickerProps {
  layout: "pills" | "sheet";
  axis: Axis;
  layer: MapLayer;
  unhinged: boolean;
  selectAxis: (axis: Axis) => void;
  selectPenalties: () => void;
}

const Axes = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space(1)};
  padding: 3px;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow-x: auto;
  max-width: 100%;
  width: max-content;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: none;
  }
`;

const AxisButton = styled.button<{ $active: boolean }>`
  position: relative;
  background: transparent;
  border: 0;
  z-index: 1;
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g76)};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  min-height: 32px;
  font-size: ${({ theme }) => theme.fontSize.sm};
  white-space: nowrap;
  cursor: pointer;
  transition: color ${({ theme }) => theme.motion.fast}s ease;

  &:hover {
    color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.fg)};
  }
`;

const SheetLabel = styled(Mono)`
  display: block;
  width: 100%;
  margin-bottom: ${({ theme }) => theme.space(2)};
  color: ${({ theme }) => theme.colors.g76};
  font-size: 10px;
  letter-spacing: 0.16em;
  line-height: 1.4;
  text-align: center;
  text-transform: uppercase;
`;

const SheetAxes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 52px;
  gap: ${({ theme }) => theme.space(1.5)};
`;

const SheetAxis = styled.button<{ $active: boolean; $accent: string }>`
  width: 100%;
  height: 52px;
  padding: ${({ theme }) => theme.space(3)};
  border: 1px solid ${({ $active, $accent, theme }) => ($active ? $accent : theme.colors.g12)};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, $accent }) => ($active ? $accent : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g90)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
`;

/**
 * Full-width tile in the 2-column mobile sheet. Spanning both columns avoids
 * an orphan cell after the 2x2 of axes.
 */
const SheetLayer = styled.button<{ $active: boolean }>`
  grid-column: span 2;
  width: 100%;
  height: 52px;
  padding: ${({ theme }) => theme.space(3)};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.penalty : theme.colors.g12)};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.penalty : "transparent"};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g90)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
`;

const Scrim = styled.button<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 0;
    z-index: -1;
    border: 0;
    background: rgba(0, 0, 0, 0.72);
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transition: opacity 160ms ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

const MobileSheet = styled.div<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 auto;
    z-index: 0;
    max-height: calc(100dvh - 59px);
    overflow-y: auto;
    padding: ${({ theme }) => theme.space(4)} ${({ theme }) => theme.space(3)}
      ${({ theme }) => theme.space(5)};
    border-bottom: 1px solid ${({ theme }) => theme.colors.g20};
    background: ${({ theme }) => theme.colors.bg};
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transform: translate3d(0, ${({ $open }) => ($open ? "0" : "-10px")}, 0);
    will-change: ${({ $open }) => ($open ? "transform, opacity" : "auto")};
    transition:
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 140ms ease,
      visibility 0s linear ${({ $open }) => ($open ? "0s" : "180ms")};

    @media (prefers-reduced-motion: reduce) {
      transform: none;
      transition: none;
    }
  }
`;

const SheetInner = styled.div`
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
`;

export const SheetActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 52px;
  gap: ${({ theme }) => theme.space(2)};
  margin-top: ${({ theme }) => theme.space(4)};
  padding-top: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
`;

export const SheetAction = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 52px;
  padding: 0 ${({ theme }) => theme.space(3)};
  border: 1px solid ${({ $active, theme }) => ($active ? "#E53E3E" : theme.colors.g12)};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active }) => ($active ? "#E53E3E" : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.fg)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-decoration: none;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
`;

const PILL_SPRING = { type: "spring" as const, stiffness: 480, damping: 38 };

export function LayerPicker({
  layout,
  axis,
  layer,
  unhinged,
  selectAxis,
  selectPenalties,
}: LayerPickerProps) {
  const penaltiesActive = layer === "penalties";
  const finesCopy = resolveFinesCopy(unhinged);

  if (layout === "pills") {
    return (
      <Axes>
        {AXES.map((a) => {
          const active = !penaltiesActive && axis === a.key;
          const copy = resolveAxisCopy(a.key, unhinged);
          return (
            <AxisButton
              key={a.key}
              $active={active}
              onClick={() => selectAxis(a.key)}
              title={copy.blurb}
            >
              {active && (
                <PillHighlight
                  layoutId="axis-active"
                  $bg={AXIS_ACCENT[a.key]}
                  transition={PILL_SPRING}
                />
              )}
              {copy.label}
            </AxisButton>
          );
        })}
        <AxisButton
          $active={penaltiesActive}
          onClick={selectPenalties}
          title={finesCopy.blurb}
        >
          {penaltiesActive && (
            <PillHighlight
              layoutId="axis-active"
              $bg={theme.colors.penalty}
              transition={PILL_SPRING}
            />
          )}
          {finesCopy.label}
        </AxisButton>
      </Axes>
    );
  }

  return (
    <SheetAxes>
      {AXES.map((a) => {
        const copy = resolveAxisCopy(a.key, unhinged);
        return (
          <SheetAxis
            key={a.key}
            $active={!penaltiesActive && axis === a.key}
            $accent={AXIS_ACCENT[a.key]}
            onClick={() => selectAxis(a.key)}
          >
            {copy.label}
          </SheetAxis>
        );
      })}
      <SheetLayer $active={penaltiesActive} onClick={selectPenalties}>
        {finesCopy.label}
      </SheetLayer>
    </SheetAxes>
  );
}

/** Compact menu sheet: layer picker plus a slot for Filters / Funny / About. */
export function NavSheet({
  open,
  onClose,
  children,
  ...picker
}: Omit<LayerPickerProps, "layout"> & {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <Scrim
        $open={open}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <MobileSheet
        id="mobile-navigation"
        $open={open}
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <SheetInner>
          <SheetLabel>Choose what the map shows</SheetLabel>
          <LayerPicker layout="sheet" {...picker} />
          {children}
        </SheetInner>
      </MobileSheet>
    </>
  );
}
