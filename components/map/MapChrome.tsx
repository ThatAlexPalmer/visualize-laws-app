"use client";

import { useMemo, type ReactNode } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";

import { useExplorer } from "@/lib/store";
import { theme } from "@/lib/theme";
import {
  cityStandInLabel,
  fineHoverLine,
  prettySlug,
  stateName,
  type PenaltyStats,
} from "@/lib/types";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";
import { PlaceChip } from "@/components/ui/PlaceChip";

import { formatSparseCountyCopy } from "./sparseCounties";
import { useMapView } from "./MapViewProvider";
import type { Hovered } from "./draw";

const Frame = styled.div`
  position: relative;
  flex-shrink: 0;
`;

export const MapStage = styled.div`
  position: relative;
  width: 100%;
  height: clamp(360px, 44vh, 520px);
  min-height: 360px;
  /* The map is a flex child of the scrolling <Main> column. Without this it
     keeps the default flex-shrink: 1, so when selecting a state grows the
     panels below (results + jurisdiction) the flexbox shrinks this box.
     That height change fires the ResizeObserver and the canvas jumps.
     Locking flex-shrink pins the map height; the panels overflow into <Main>. */
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

export const BaseCanvas = styled(motion.canvas)`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
`;

export const OverlayCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
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

export function MapChrome({ children }: { children: ReactNode }) {
  return <Frame>{children}</Frame>;
}

export function MapHud({ hovered }: { hovered: Hovered | null }) {
  const { state, dispatch } = useExplorer();
  const { status, retry } = useJurisdictions();
  const {
    rows,
    scoredCounties,
    sparseCounties,
    loadingLine,
    fillByKey,
    aggByUsps,
    selectedCounty,
  } = useMapView();

  const layer = state.layer;
  const selectedState = state.selectedState;
  const atlasCountyName = state.atlasCountyName;
  const selectedCity = state.filters.city ?? null;

  const hoveredCountyLabel =
    hovered?.kind === "county"
      ? (hovered.countyName ??
        prettySlug(hovered.countySlug) ??
        stateName(hovered.usps))
      : null;
  const hoveredHasScore = Boolean(
    hovered?.kind === "county" && hovered.sourcePlace,
  );
  const hoveredPenalties = useMemo<PenaltyStats | null | undefined>(() => {
    if (layer !== "penalties" || !hovered) return undefined;
    if (hovered.kind === "state") {
      return hovered.usps
        ? (aggByUsps.get(hovered.usps)?.penalties ?? null)
        : null;
    }
    if (!hovered.sourcePlace || !hovered.fillSource) return null;
    return (
      fillByKey.get(`${hovered.fillSource}:${hovered.sourcePlace}`)
        ?.penalties ?? null
    );
  }, [layer, hovered, aggByUsps, fillByKey]);

  const mapLabel = hovered
    ? hovered.kind === "county"
      ? hovered.fillSource === "city" && hovered.sourcePlace
        ? cityStandInLabel(
            hovered.countyName ?? hoveredCountyLabel ?? "",
            hovered.sourcePlace,
          )
        : hoveredHasScore
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

  const fineLine =
    hovered && hoveredPenalties !== undefined
      ? fineHoverLine(hoveredPenalties)
      : null;

  const sparseCopy = useMemo(() => {
    if (!sparseCounties || !selectedState) return null;
    const names = scoredCounties
      .map((r) =>
        r.source === "city"
          ? cityStandInLabel(r.name, r.sourcePlace)
          : r.name,
      )
      .sort((a, b) => a.localeCompare(b));
    return formatSparseCountyCopy(stateName(selectedState), names);
  }, [sparseCounties, selectedState, scoredCounties]);

  const noMapData = status === "ready" && rows.length === 0;

  return (
    <>
      {noMapData && (
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
        {fineLine && <SparseLine>{fineLine}</SparseLine>}
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
                const key = `${row.source}:${row.sourcePlace}`;
                if (!row.sourcePlace) return null;
                const active =
                  row.source === "city"
                    ? selectedCity === row.sourcePlace
                    : selectedCounty === row.county;
                const label =
                  row.source === "city"
                    ? cityStandInLabel(row.name, row.sourcePlace)
                    : row.name;
                return (
                  <PlaceChip
                    key={key}
                    type="button"
                    $active={active}
                    onClick={() => {
                      if (!selectedState) return;
                      dispatch({
                        type: "selectFocus",
                        focus:
                          row.source === "city"
                            ? {
                                kind: "city",
                                state: selectedState,
                                city: row.sourcePlace,
                              }
                            : {
                                kind: "county",
                                state: selectedState,
                                county: row.county ?? row.sourcePlace,
                              },
                      });
                    }}
                  >
                    {label}
                  </PlaceChip>
                );
              })}
          </SparseChips>
        )}
      </TitleStack>
    </>
  );
}
