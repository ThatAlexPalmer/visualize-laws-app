"use client";

// STUB (owned by agent-ui). Replace with keyword search, four score range
// sliders, and state/county/function/topic/substantive filters (all wired to
// the store's `filters` and dispatched via { type: "patchFilters" }).
import styled from "styled-components";

const Aside = styled.aside`
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid ${({ theme }) => theme.colors.g12};
  padding: ${({ theme }) => theme.space(4)};
  overflow-y: auto;
  z-index: ${({ theme }) => theme.z.sidebar};

  @media (max-width: 720px) {
    display: none;
  }
`;

const Label = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
`;

export function Sidebar() {
  return (
    <Aside>
      <Label>Search &amp; Filters</Label>
    </Aside>
  );
}
