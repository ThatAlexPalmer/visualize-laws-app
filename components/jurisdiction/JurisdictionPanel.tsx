"use client";

// STUB (owned by agent-ui). Replace with the jurisdiction dashboard: aggregate
// stats + top laws from GET /api/jurisdictions/[state] when a state is selected.
import styled from "styled-components";
import { useExplorer } from "@/lib/store";
import { stateName } from "@/lib/types";

const Panel = styled.aside`
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.space(4)};
  color: ${({ theme }) => theme.colors.g48};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function JurisdictionPanel() {
  const { state } = useExplorer();
  return (
    <Panel>
      {state.selectedState
        ? `jurisdiction: ${stateName(state.selectedState)}`
        : "select a state on the map"}
    </Panel>
  );
}
