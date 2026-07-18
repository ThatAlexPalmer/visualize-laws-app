"use client";

import styled from "styled-components";
import { DesktopFilters, Sidebar } from "@/components/sidebar/Sidebar";
import { MapPanel } from "@/components/map/MapPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import {
  AggregateRail,
  JurisdictionPanel,
} from "@/components/jurisdiction/JurisdictionPanel";
import { LawModal } from "@/components/modal/LawModal";
import { Footer } from "@/components/footer/Footer";

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100vw;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bg};
`;

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* Reserve the scrollbar gutter so the map's width stays constant whether or
     not this column is scrollable. Selecting a state grows the panels below the
     map; without this the scrollbar's appearance would shrink the content width
     and re-fit the geoAlbersUsa projection, making the canvas visibly jump. */
  scrollbar-gutter: stable;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    scrollbar-gutter: auto;
  }
`;

const Lower = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  grid-auto-rows: minmax(640px, auto);
  align-items: stretch;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
    gap: ${({ theme }) => theme.space(3)};
    padding: ${({ theme }) => theme.space(3)};
  }
`;

export default function Page() {
  return (
    <Shell>
      <Body>
        <AggregateRail />
        <Sidebar />
        <Main>
          <MapPanel />
          <JurisdictionPanel />
          <Lower>
            <ResultsPanel />
            <DesktopFilters />
          </Lower>
        </Main>
      </Body>
      <Footer />
      <LawModal />
    </Shell>
  );
}
