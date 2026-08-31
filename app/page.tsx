"use client";

import styled from "styled-components";
import { DesktopFilters, Sidebar } from "@/components/sidebar/Sidebar";
import { ConnectedMapLegend } from "@/components/map/Legend";
import { MapChrome } from "@/components/map/MapChrome";
import { MapPanel } from "@/components/map/MapPanel";
import { MapViewProvider } from "@/components/map/MapViewProvider";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import {
  AggregateRail,
  JurisdictionPanel,
} from "@/components/jurisdiction/JurisdictionPanel";
import { JurisdictionsProvider } from "@/components/jurisdiction/JurisdictionsProvider";
import { LawModal } from "@/components/modal/LawModal";
import { Footer } from "@/components/footer/Footer";
import { QuickSearch } from "@/components/search/QuickSearch";

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
  overflow: hidden;
  /* Reserve the scrollbar gutter so the map's width stays constant whether or
     not this column is scrollable. Selecting a state grows the panels below the
     map; without this the scrollbar's appearance would shrink the content width
     and re-fit the geoAlbersUsa projection, making the canvas visibly jump. */
  scrollbar-gutter: stable;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    overflow-y: auto;
    scrollbar-gutter: auto;
  }
`;

const Lower = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  gap: 0;
  padding: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.g08};

  > * {
    border-top: 0;
    border-bottom: 0;
  }

  > * + * {
    border-left: 0;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    flex: none;
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    gap: ${({ theme }) => theme.space(3)};
    padding: ${({ theme }) => theme.space(3)};

    > * {
      border: 1px solid ${({ theme }) => theme.colors.g08};
    }
  }
`;

export default function Page() {
  return (
    <JurisdictionsProvider>
      <Shell>
        <Body>
          <AggregateRail />
          <Sidebar />
          <Main>
            <MapViewProvider>
              <MapChrome>
                <QuickSearch />
                <MapPanel />
              </MapChrome>
              <ConnectedMapLegend />
            </MapViewProvider>
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
    </JurisdictionsProvider>
  );
}
