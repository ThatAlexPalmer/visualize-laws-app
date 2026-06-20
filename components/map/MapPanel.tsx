"use client";

// STUB (owned by agent-map). Replace with the HTML5 Canvas choropleth:
//  - load us-atlas TopoJSON, project with d3-geo geoAlbersUsa + geoPath(context)
//  - color each state by the selected axis average from GET /api/jurisdictions
//  - click-to-filter via ctx.isPointInPath hit testing -> dispatch selectState
//  - subtle film-grain overlay + framer-motion crossfade on axis/filter change
import styled from "styled-components";
import { useExplorer } from "@/lib/store";
import { AXIS_BY_KEY } from "@/lib/types";

const Wrap = styled.div`
  position: relative;
  width: 100%;
  min-height: 440px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.g32};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  z-index: ${({ theme }) => theme.z.map};
`;

export function MapPanel() {
  const { state } = useExplorer();
  return <Wrap>canvas choropleth · axis: {AXIS_BY_KEY[state.axis].label}</Wrap>;
}
