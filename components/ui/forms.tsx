"use client";

// Form control primitives + the extracted range-slider chrome. Every control
// shares one monochrome field treatment (g04 fill, g12 border, g48 focus) so
// the look can be tuned from a single place.
import styled, { css } from "styled-components";
import { motion } from "framer-motion";

/** Shared field box treatment for `<input>` / `<select>`. */
const fieldBox = css`
  width: 100%;
  background: ${({ theme }) => theme.colors.g04};
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 10px 12px;
  font-size: ${({ theme }) => theme.fontSize.md};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.colors.fg};
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.g48};
  }
`;

export const Input = styled.input`
  ${fieldBox}

  &::placeholder {
    color: ${({ theme }) => theme.colors.g32};
  }
`;

export const Select = styled.select`
  ${fieldBox}
  cursor: pointer;
  appearance: none;

  option {
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.fg};
  }
`;

/** Label + control stack (formerly the sidebar "Group"). */
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
`;

export const FieldLabel = styled.label`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
`;

/** Segmented (pill) toggle group — equal-width columns for any child count. */
export const Segmented = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: ${({ theme }) => theme.space(1)};
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: 3px;
`;

export const SegItem = styled.button<{ $active: boolean }>`
  position: relative;
  z-index: 1;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: ${({ theme }) => theme.space(1.5)} 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g64)};
  transition: color ${({ theme }) => theme.motion.fast}s ease;
`;

/** Sliding white highlight behind the active segment / axis pill (framer layout). */
export const PillHighlight = styled(motion.span)`
  position: absolute;
  inset: 0;
  z-index: -1;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

/* ---- Range-slider chrome: two overlaid native range inputs over a rail ---- */

export const SliderTrack = styled.div`
  position: relative;
  height: 24px;
  display: flex;
  align-items: center;
`;

export const SliderRail = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

export const SliderFill = styled.div`
  position: absolute;
  height: 2px;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

/** A single native range input styled as an invisible track + white thumb. */
export const SliderInput = styled.input<{ $z: number }>`
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
