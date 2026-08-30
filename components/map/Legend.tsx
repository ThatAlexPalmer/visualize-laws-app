"use client";

import { useMemo } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";

import { resolveAxisCopy } from "@/lib/copy";
import { useExplorer } from "@/lib/store";
import {
  formatFine,
  formatShare,
  nativeCountyToFill,
  type Axis,
  type CountyFill,
  type JurisdictionAgg,
  type MapLayer,
  type PenaltyStats,
} from "@/lib/types";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import {
  computeLayerDomain,
  rampColorForLayer,
  type Domain,
} from "./color";
import { COUNTY_FILL_MIN, countyScaleReady } from "./sparseCounties";

interface Props {
  axis: Axis;
  layer: MapLayer;
  axisLabel: string;
  blurb: string;
  domain: Domain | null;
}

const EMPTY_ROWS: JurisdictionAgg[] = [];

/**
 * Full-width slot under the map so the card never paints over the canvas.
 *
 * Wide and short (~90px), so the penalties stats sit *beside* the legend and
 * use the band that would otherwise be empty. At <=lg everything stacks, and
 * the stats collapse into a single card to limit added scroll length.
 */
const Slot = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space(3)};
  justify-content: flex-start;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
  background: ${({ theme }) => theme.colors.bg};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    flex-direction: column;
    padding: ${({ theme }) => theme.space(3)};
  }
`;

const Box = styled(motion.div)`
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
  padding: ${({ theme }) => theme.space(3)};
  background: ${({ theme }) => theme.colors.g04};
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: 0;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    width: 100%;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    padding: ${({ theme }) => theme.space(2.5)};
  }
`;

const Label = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.fg};
`;

const Blurb = styled.div`
  font-size: ${({ theme }) => theme.fontSize.sm};
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.g68};
`;

const Bar = styled.div`
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid ${({ theme }) => theme.colors.g08};
`;

const Scale = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g68};
`;

const Direction = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g60};
  margin-top: -${({ theme }) => theme.space(0.5)};
`;

/** Stat cards filling the band beside the legend on the penalties layer. */
const Stats = styled(motion.div)`
  display: flex;
  gap: ${({ theme }) => theme.space(3)};
  align-items: stretch;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    /* One card with inline rows on mobile: three stacked cards would add
       ~240px of scrolling to an already tall column. */
    flex-direction: column;
    gap: 0;
    width: 100%;
    padding: ${({ theme }) => theme.space(3)};
    border: 1px solid ${({ theme }) => theme.colors.g12};
    background: ${({ theme }) => theme.colors.g04};
  }
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(1)};
  min-width: 132px;
  padding: ${({ theme }) => theme.space(3)};
  border: 1px solid ${({ theme }) => theme.colors.g12};
  background: ${({ theme }) => theme.colors.g04};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
    padding: ${({ theme }) => theme.space(1)} 0;
    border: 0;
    background: transparent;
  }
`;

const StatLabel = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g60};
`;

const StatValue = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.lg};
  color: ${({ theme }) => theme.colors.fg};
  line-height: 1.1;
`;

/** The comparison half of a stat, dimmed so the headline number leads. */
const StatAside = styled.span`
  color: ${({ theme }) => theme.colors.g60};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const StatSub = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.g60};
`;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** A z-scored average, sign always shown so the comparison reads at a glance. */
function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}`;
}

/** Legend scale text: a percentage on the penalties layer, else a z-score. */
function fmtDomain(value: number, layer: MapLayer): string {
  return layer === "penalties" ? formatShare(value) : fmt(value);
}

/**
 * The figures that do not work as colour.
 *
 * Median fine in particular: 32 of 50 states sit at exactly $500, so painting
 * it would be two-thirds one flat shade. As a number it is the finding.
 */
function PenaltyStatsCards({ stats }: { stats: PenaltyStats }) {
  const share =
    stats.penaltySections > 0
      ? formatShare(stats.amountSections / stats.penaltySections)
      : "—";

  // The link between this layer and the four axes: within the sections a model
  // read, the ones naming a dollar figure score markedly higher on problem
  // salience. Hidden when either side is too thin to mean anything.
  const salience =
    stats.salienceAmount !== null && stats.salienceNoAmount !== null
      ? {
          withFine: signed(stats.salienceAmount),
          without: signed(stats.salienceNoAmount),
        }
      : null;

  return (
    <Stats
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Stat>
        <StatLabel>Typical fine</StatLabel>
        <StatValue>
          {stats.medianFine === null ? "—" : formatFine(stats.medianFine)}
        </StatValue>
      </Stat>
      <Stat>
        <StatLabel>Name a fine</StatLabel>
        <StatValue>{share}</StatValue>
      </Stat>
      {salience && (
        <Stat title="Average problem salience, among sections a model read">
          <StatLabel>Problem salience</StatLabel>
          <StatValue>
            {salience.withFine}
            <StatAside> vs {salience.without}</StatAside>
          </StatValue>
          <StatSub>with a fine · without</StatSub>
        </Stat>
      )}
    </Stats>
  );
}

/** Compact legend: label, blurb, and the layer-colored value ramp. */
export function MapLegend({ axis, layer, axisLabel, blurb, domain }: Props) {
  const barStyle = {
    background:
      `linear-gradient(90deg, ${rampColorForLayer(0, layer, axis)} 0%, ` +
      `${rampColorForLayer(1, layer, axis)} 100%)`,
  };
  return (
    <Box
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Label>{axisLabel}</Label>
      <Blurb>{blurb}</Blurb>
      <Bar style={barStyle} />
      <Scale>
        <span>{domain ? fmtDomain(domain.min, layer) : "—"}</span>
        <span>{domain ? fmtDomain(domain.max, layer) : "—"}</span>
      </Scale>
      <Direction>
        <span>less</span>
        <span>more</span>
      </Direction>
    </Box>
  );
}

/**
 * The ramp is hidden when in-state scored n < K, but the penalty stats are
 * not: they describe the selected scope rather than the county mesh, so they
 * must survive that early return or they vanish in the eight thin states.
 */
export function ConnectedMapLegend({
  countiesBaked,
}: {
  countiesBaked: boolean;
}) {
  const { state } = useExplorer();
  const { data, stateDetail } = useJurisdictions();
  const axis = state.axis;
  const layer = state.layer;
  const selectedState = state.selectedState;
  const rows = data?.rows ?? EMPTY_ROWS;
  const countyRows = stateDetail?.counties ?? EMPTY_ROWS;
  const fillRows = useMemo<CountyFill[]>(() => {
    const stored = stateDetail?.countyFills;
    if (stored && stored.length > 0) return stored;
    return countyRows.map(nativeCountyToFill);
  }, [stateDetail?.countyFills, countyRows]);

  const scoredCountyN = useMemo(
    () => fillRows.filter((r) => r.sourcePlace).length,
    [fillRows],
  );
  const sparseCounties =
    Boolean(selectedState && stateDetail) && scoredCountyN < COUNTY_FILL_MIN;
  const countyViewReady = countyScaleReady({
    selectedState,
    stateDetail,
    countiesBaked,
  });

  const domain = useMemo(
    () =>
      computeLayerDomain(
        layer,
        axis,
        countyViewReady && !sparseCounties ? fillRows : rows,
      ),
    [layer, axis, countyViewReady, sparseCounties, fillRows, rows],
  );

  // Penalty figures for the current scope: the selected state, else the nation.
  const penalties: PenaltyStats | null = selectedState
    ? (stateDetail?.jurisdiction?.penalties ?? null)
    : (data?.national?.penalties ?? null);

  const axisCopy = resolveAxisCopy(axis, state.unhinged);
  const showRamp = !sparseCounties;
  const showStats = layer === "penalties" && penalties !== null;

  if (!showRamp && !showStats) return null;

  return (
    <Slot>
      {showRamp && (
        <MapLegend
          axis={axis}
          layer={layer}
          axisLabel={layer === "penalties" ? "Fines" : axisCopy.label}
          blurb={
            layer === "penalties"
              ? "Share of the sections a model read that name a dollar fine."
              : axisCopy.blurb
          }
          domain={domain}
        />
      )}
      {showStats && penalties && <PenaltyStatsCards stats={penalties} />}
    </Slot>
  );
}
