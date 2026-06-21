"use client";

import styled from "styled-components";
import { TopNav } from "@/components/nav/TopNav";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MapPanel } from "@/components/map/MapPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { JurisdictionPanel } from "@/components/jurisdiction/JurisdictionPanel";
import { LawModal } from "@/components/modal/LawModal";
import { Footer } from "@/components/footer/Footer";

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
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
`;

const Lower = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(280px, 360px);
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    grid-template-columns: 1fr;
  }
`;

export default function Page() {
  return (
    <Shell>
      <TopNav />
      <Body>
        <Sidebar />
        <Main>
          <MapPanel />
          <Lower>
            <ResultsPanel />
            <JurisdictionPanel />
          </Lower>
        </Main>
      </Body>
      <Footer />
      <LawModal />
    </Shell>
  );
}
