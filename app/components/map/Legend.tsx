"use client";

import styled from "styled-components";
import { motion } from "framer-motion";

import { rampColor, type Domain } from "./color";

interface Props {
  axisLabel: string;
  blurb: string;
  domain: Domain | null;
}

const Box = styled(motion.div)`
  position: absolute;
  left: ${({ theme }) => theme.space(4)};
  bottom: ${({ theme }) => theme.space(4)};
  z-index: 3;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
  padding: ${({ theme }) => theme.space(3)};
  background: ${({ theme }) => theme.colors.g04};
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.md};
  backdrop-filter: blur(6px);
  pointer-events: none;
`;

const Label = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.fg};
`;

const Blurb = styled.div`
  font-size: ${({ theme }) => theme.fontSize.xs};
  line-height: 1.35;
  color: ${({ theme }) => theme.colors.g48};
`;

const Bar = styled.div`
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: linear-gradient(90deg, ${rampColor(0)} 0%, ${rampColor(1)} 100%);
  border: 1px solid ${({ theme }) => theme.colors.g08};
`;

const Scale = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g48};
`;

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Compact legend: axis label, blurb, and the monochrome value ramp. */
export function MapLegend({ axisLabel, blurb, domain }: Props) {
  return (
    <Box
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Label>{axisLabel}</Label>
      <Blurb>{blurb}</Blurb>
      <Bar />
      <Scale>
        <span>{domain ? fmt(domain.min) : "—"}</span>
        <span>{domain ? fmt(domain.max) : "—"}</span>
      </Scale>
    </Box>
  );
}
