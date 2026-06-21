"use client";

// Reusable text primitives. Centralizes the app's recurring typographic
// patterns — display headings, mono micro-labels, muted body copy, and subtle
// links — so restyling happens in one place. Strict monochrome: every color
// comes from a theme token.
import styled from "styled-components";

/** Bold display heading. Defaults to the `lg` size; override via `$size`. */
export const Heading = styled.h2<{ $size?: "lg" | "xl" | "xxl" }>`
  margin: 0;
  color: ${({ theme }) => theme.colors.fg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme, $size }) => theme.fontSize[$size ?? "lg"]};
  line-height: 1.2;
`;

/** Inline monospace text in the brand/aesthetic font. */
export const Mono = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

/** Muted body copy. Tone defaults to the brightest gray (`g80`). */
export const Muted = styled.p<{ $tone?: "g48" | "g64" | "g80"; $size?: "sm" | "md" | "lg" }>`
  margin: 0;
  line-height: 1.6;
  color: ${({ theme, $tone }) => theme.colors[$tone ?? "g80"]};
  ${({ theme, $size }) => $size && `font-size: ${theme.fontSize[$size]};`}
`;

/** The recurring mono / xs / uppercase / letter-spaced micro-label. */
export const Kicker = styled.span<{ $tone?: "g48" | "g64" }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme, $tone }) => theme.colors[$tone ?? "g48"]};
`;

/** Subtle mono text link (g64 → fg on hover). Render as a Next `<Link>` via `as`. */
export const MonoLink = styled.a<{ $size?: "xs" | "sm" }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme, $size }) => theme.fontSize[$size ?? "sm"]};
  color: ${({ theme }) => theme.colors.g64};
  cursor: pointer;
  transition: color ${({ theme }) => theme.motion.fast}s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;
