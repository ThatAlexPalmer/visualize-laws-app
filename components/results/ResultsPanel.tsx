"use client";

// STUB (owned by agent-ui). Replace with the high-performance paginated results
// list backed by GET /api/laws (server-side filter/sort/pagination). Each row
// opens the LawModal via dispatch({ type: "openLaw", law }).
import styled from "styled-components";

const Panel = styled.section`
  min-height: 200px;
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.space(4)};
  color: ${({ theme }) => theme.colors.g48};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function ResultsPanel() {
  return <Panel>results list</Panel>;
}
