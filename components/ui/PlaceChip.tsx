"use client";

import styled from "styled-components";

/** Pill chip for a selected / unselected place (jurisdiction city list). */
export const PlaceChip = styled.button<{ $active: boolean }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.g60 : theme.colors.g20)};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.g12 : "transparent"};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(2)};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.fg : theme.colors.g90};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
    border-color: ${({ theme }) => theme.colors.g60};
  }
`;
