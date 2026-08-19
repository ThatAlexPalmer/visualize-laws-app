"use client";

import { useMemo } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";

import { resolveAxisCopy } from "@/lib/copy";
import { useExplorer } from "@/lib/store";
import type { Axis, JurisdictionAgg } from "@/lib/types";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";

import { computeDomain, rampColorForAxis, type Domain } from "./color";
import { COUNTY_FILL_MIN } from "./sparseCounties";

interface Props {
  axis: Axis;
  axisLabel: string;
  blurb: string;
  domain: Domain | null;
}

const EMPTY_ROWS: JurisdictionAgg[] = [];

/** Full-width slot under the map so the card never paints over the canvas. */
const Slot = styled.div`
  flex-shrink: 0;
  display: flex;
  justify-content: flex-start;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
  background: ${({ theme }) => theme.colors.bg};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
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

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Compact legend: axis label, blurb, and the axis-colored value ramp. */
export function MapLegend({ axis, axisLabel, blurb, domain }: Props) {
  const barStyle = {
    background: `linear-gradient(90deg, ${rampColorForAxis(0, axis)} 0%, ${rampColorForAxis(1, axis)} 100%)`,
  };
  return (
    <Slot>
      <Box
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Label>{axisLabel}</Label>
        <Blurb>{blurb}</Blurb>
        <Bar style={barStyle} />
        <Scale>
          <span>{domain ? fmt(domain.min) : "—"}</span>
          <span>{domain ? fmt(domain.max) : "—"}</span>
        </Scale>
        <Direction>
          <span>less</span>
          <span>more</span>
        </Direction>
      </Box>
    </Slot>
  );
}

/**
 * Same visibility + domain as the choropleth: hidden only for sparse county
 * views (n < K). Lives in document flow under the map, never over the canvas.
 */
export function ConnectedMapLegend() {
  const { state } = useExplorer();
  const { data, stateDetail } = useJurisdictions();
  const axis = state.axis;
  const selectedState = state.selectedState;
  const rows = data?.rows ?? EMPTY_ROWS;
  const countyRows = stateDetail?.counties ?? EMPTY_ROWS;

  const scoredCountyN = useMemo(
    () => countyRows.filter((r) => r.county).length,
    [countyRows],
  );
  const sparseCounties =
    Boolean(selectedState && stateDetail) && scoredCountyN < COUNTY_FILL_MIN;
  const countyViewReady = Boolean(selectedState && stateDetail);

  const domain = useMemo(
    () =>
      computeDomain(
        axis,
        countyViewReady && !sparseCounties ? countyRows : rows,
      ),
    [axis, countyViewReady, sparseCounties, countyRows, rows],
  );

  const show = !selectedState || scoredCountyN >= COUNTY_FILL_MIN;
  if (!show) return null;

  const axisCopy = resolveAxisCopy(axis, state.unhinged);
  return (
    <MapLegend
      axis={axis}
      axisLabel={axisCopy.label}
      blurb={axisCopy.blurb}
      domain={domain}
    />
  );
}
