"use client";

// Button primitives. A single themeable <Button> drives every call-to-action
// through the `$variant` / `$size` / `$pill` transient props, with a matching
// link-styled variant for Next navigation and a square icon button.
import styled, { css } from "styled-components";
import Link from "next/link";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

interface ButtonProps {
  $variant?: Variant;
  $size?: Size;
  $pill?: boolean;
}

const buttonBase = css<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space(1.5)};
  white-space: nowrap;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  font-size: ${({ theme, $size }) => ($size === "md" ? theme.fontSize.sm : theme.fontSize.xs)};
  padding: ${({ theme, $size }) =>
    $size === "md"
      ? `${theme.space(2)} ${theme.space(4)}`
      : `${theme.space(1)} ${theme.space(2.5)}`};
  border-radius: ${({ theme, $pill }) => ($pill ? theme.radius.pill : theme.radius.sm)};
  transition: ${({ theme }) => theme.transitions.default};

  background: ${({ theme, $variant }) => ($variant === "primary" ? theme.colors.fg : "transparent")};
  color: ${({ theme, $variant }) =>
    $variant === "primary"
      ? theme.colors.bg
      : $variant === "subtle"
        ? theme.colors.g64
        : theme.colors.fg};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === "ghost"
        ? theme.colors.g20
        : $variant === "danger"
          ? theme.colors.g48
          : "transparent"};

  &:hover:not(:disabled) {
    ${({ theme, $variant }) =>
      $variant === "primary"
        ? css`
            opacity: 0.85;
          `
        : $variant === "subtle"
          ? css`
              color: ${theme.colors.fg};
            `
          : css`
              color: ${theme.colors.fg};
              border-color: ${theme.colors.g48};
            `}
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

/** The primary button element. */
export const Button = styled.button<ButtonProps>`
  ${buttonBase}
`;

/** Same button styling, rendered as a Next `<Link>`. */
export const ButtonLink = styled(Link)<ButtonProps>`
  ${buttonBase}
`;

/** Square icon button (e.g. the modal close affordance). */
export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  line-height: 1;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.g20};
  color: ${({ theme }) => theme.colors.g64};
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  transition: ${({ theme }) => theme.transitions.default};

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
    border-color: ${({ theme }) => theme.colors.g48};
  }
`;
