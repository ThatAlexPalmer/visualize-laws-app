"use client";

// Dual-handle range slider built from two overlaid native <input type="range">
// elements (no extra deps). The track/fill are drawn behind; only the thumbs
// capture pointer events. Pure monochrome to match the strict aesthetic.
import styled from "styled-components";
import type { ScoreRange } from "@/lib/types";

interface Props {
  label: string;
  domainMin: number;
  domainMax: number;
  step?: number;
  value: ScoreRange;
  onChange: (next: ScoreRange) => void;
  format?: (n: number) => string;
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: ${({ theme }) => theme.space(2)};
`;

const Name = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g64};
`;

const Vals = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.fg};
  white-space: nowrap;
`;

const Track = styled.div`
  position: relative;
  height: 24px;
  display: flex;
  align-items: center;
`;

const Rail = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

const Fill = styled.div`
  position: absolute;
  height: 2px;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

const Range = styled.input<{ $z: number }>`
  position: absolute;
  left: 0;
  right: 0;
  width: 100%;
  margin: 0;
  height: 24px;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
  z-index: ${({ $z }) => $z};

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.fg};
    border: 1px solid ${({ theme }) => theme.colors.bg};
    cursor: pointer;
  }

  &::-moz-range-thumb {
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.fg};
    border: 1px solid ${({ theme }) => theme.colors.bg};
    cursor: pointer;
  }

  &::-webkit-slider-runnable-track {
    background: transparent;
  }
  &::-moz-range-track {
    background: transparent;
  }

  &:focus-visible {
    outline: none;
  }
  &:focus-visible::-webkit-slider-thumb {
    outline: 2px solid ${({ theme }) => theme.colors.g48};
    outline-offset: 2px;
  }
  &:focus-visible::-moz-range-thumb {
    outline: 2px solid ${({ theme }) => theme.colors.g48};
    outline-offset: 2px;
  }
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
    <Wrap>
      <Head>
        <Name>{label}</Name>
        <Vals>
          {format(lo)} — {format(hi)}
        </Vals>
      </Head>
      <Track>
        <Rail />
        <Fill
          style={{
            left: `${pct(lo)}%`,
            width: `${Math.max(0, pct(hi) - pct(lo))}%`,
          }}
        />
        <Range
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
        <Range
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
      </Track>
    </Wrap>
  );
}
