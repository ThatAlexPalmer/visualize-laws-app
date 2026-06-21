"use client";

// Layout container primitives: bordered surfaces (Panel, Card) plus the small
// flexbox helpers (Stack / Row / Cluster) the feature components compose from.
// Centralizing these removes the repeated `display:flex; gap: space(n)` blocks
// scattered across the app.
import styled from "styled-components";

/** Bordered surface used for the results + jurisdiction panels. */
export const Panel = styled.section`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.md};
`;

/** Generic bordered card surface. */
export const Card = styled.div`
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

/** Vertical flexbox with a token-based gap (defaults to space(4)). */
export const Stack = styled.div<{ $gap?: number; $align?: string }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $gap }) => theme.space($gap ?? 4)};
  ${({ $align }) => $align && `align-items: ${$align};`}
`;

/** Horizontal flexbox row (defaults: centered, space(2) gap). */
export const Row = styled.div<{ $gap?: number; $align?: string; $justify?: string }>`
  display: flex;
  align-items: ${({ $align }) => $align ?? "center"};
  justify-content: ${({ $justify }) => $justify ?? "flex-start"};
  gap: ${({ theme, $gap }) => theme.space($gap ?? 2)};
`;

/** Horizontal flexbox that wraps (chips, link rows). */
export const Cluster = styled.div<{ $gap?: number }>`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme, $gap }) => theme.space($gap ?? 2)};
`;

/** Hairline rule. */
export const Divider = styled.hr`
  width: 100%;
  margin: 0;
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
`;

/** Flex child that scrolls vertically within a fixed-height parent. */
export const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

/** Block-level mono section label (uppercase, spaced, g48). */
export const SectionLabel = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
`;
