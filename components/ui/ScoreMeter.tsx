"use client";

import styled from "styled-components";
import { motion } from "framer-motion";
import { DEFAULT_SCORE_RANGE } from "@/lib/types";
import { Stack } from "@/components/ui/containers";

const ScoreTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g76};
`;

const ScoreNum = styled.span`
  color: ${({ theme }) => theme.colors.fg};
`;

const Meter = styled.div`
  position: relative;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.colors.g12};
  overflow: hidden;
`;

const MeterFill = styled(motion.div)`
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

function clampPct(v: number): number {
  const { min, max } = DEFAULT_SCORE_RANGE;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

/** Label + numeric score + animated meter, scaled to `DEFAULT_SCORE_RANGE`. */
export function ScoreMeter({ label, value }: { label: string; value: number }) {
  return (
    <Stack $gap={1.5}>
      <ScoreTop>
        <span>{label}</span>
        <ScoreNum>{value.toFixed(2)}</ScoreNum>
      </ScoreTop>
      <Meter>
        <MeterFill
          initial={{ width: 0 }}
          animate={{ width: `${clampPct(value)}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </Meter>
    </Stack>
  );
}
