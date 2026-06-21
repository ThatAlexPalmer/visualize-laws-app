"use client";

// Dual-handle range slider built from two overlaid native <input type="range">
// elements (no extra deps). The track/fill are drawn behind; only the thumbs
// capture pointer events. Pure monochrome to match the strict aesthetic.
import styled from "styled-components";
import type { ScoreRange } from "@/lib/types";
import { Row, Stack } from "@/components/ui/containers";
import { Kicker, Mono } from "@/components/ui/text";
import {
  SliderFill,
  SliderInput,
  SliderRail,
  SliderTrack,
} from "@/components/ui/forms";

interface Props {
  label: string;
  domainMin: number;
  domainMax: number;
  step?: number;
  value: ScoreRange;
  onChange: (next: ScoreRange) => void;
  format?: (n: number) => string;
}

// The numeric readout reuses the Mono primitive; everything else (track, rail,
// fill, thumbs) now lives in components/ui/forms as reusable slider chrome.
const Vals = styled(Mono)`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.fg};
  white-space: nowrap;
`;

export function RangeSlider({
  label,
  domainMin,
  domainMax,
  step = 0.1,
  value,
  onChange,
  format = (n) => n.toFixed(1),
}: Props) {
  const span = domainMax - domainMin || 1;
  const pct = (v: number) => ((v - domainMin) / span) * 100;

  // Clamp + order the current handles inside the domain.
  const lo = Math.max(domainMin, Math.min(value.min, value.max));
  const hi = Math.min(domainMax, Math.max(value.min, value.max));

  // When both handles sit in the upper half, raise the min handle so it stays
  // grabbable even when the two thumbs overlap near the right edge.
  const minZ = lo > domainMin + span * 0.5 ? 4 : 3;

  return (
    <Stack $gap={2}>
      <Row $justify="space-between" $align="baseline" $gap={2}>
        <Kicker $tone="g64">{label}</Kicker>
        <Vals>
          {format(lo)} — {format(hi)}
        </Vals>
      </Row>
      <SliderTrack>
        <SliderRail />
        <SliderFill
          style={{
            left: `${pct(lo)}%`,
            width: `${Math.max(0, pct(hi) - pct(lo))}%`,
          }}
        />
        <SliderInput
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={lo}
          $z={minZ}
          aria-label={`${label} minimum`}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), hi);
            onChange({ min: next, max: hi });
          }}
        />
        <SliderInput
          type="range"
          min={domainMin}
          max={domainMax}
          step={step}
          value={hi}
          $z={3}
          aria-label={`${label} maximum`}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), lo);
            onChange({ min: lo, max: next });
          }}
        />
      </SliderTrack>
    </Stack>
  );
}
