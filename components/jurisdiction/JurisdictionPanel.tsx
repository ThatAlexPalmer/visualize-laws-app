"use client";

// Jurisdiction dashboard: aggregate stats + top laws from the shared
// JurisdictionsProvider cache (GET /api/jurisdictions/[state], optional ?county=).
// Tolerates an empty DB and shows an empty state when nothing is selected.
import { useEffect, useState } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  DEFAULT_SCORE_RANGE,
  amountShare,
  formatFine,
  formatShare,
  matchCountySlug,
  prettySlug,
  stateName,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";
import { Button } from "@/components/ui/buttons";
import {
  Card,
  Panel as PanelBase,
  Row,
  ScrollArea,
  SectionLabel,
  Stack,
} from "@/components/ui/containers";
import { LawMarkdown } from "@/components/law/LawMarkdown";
import { Heading } from "@/components/ui/text";

const Panel = styled(PanelBase)<{ $placement: "rail" | "mobile" }>`
  min-height: 320px;

  ${({ $placement, theme }) =>
    $placement === "rail"
      ? `
        width: 320px;
        flex-shrink: 0;
        min-height: 0;
        border: 0;
        border-right: 1px solid ${theme.colors.g12};
        border-radius: 0;
        @media (max-width: ${theme.breakpoints.lg}) { display: none; }
      `
      : `
        margin: 12px 12px 0;
        min-height: 280px;
      `}
`;

const Header = styled(Row)`
  justify-content: space-between;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
`;

// Clear reuses the subtle Button; it only drops padding and dims the label.
const Clear = styled(Button)`
  padding: 0;
  color: ${({ theme }) => theme.colors.g68};
`;

const Inner = styled(ScrollArea)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(4)};
`;

const CountRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.space(3)};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    grid-template-columns: 1fr 1fr;
  }
`;

const Stat = styled(Card)`
  padding: ${({ theme }) => theme.space(3)};
`;

const StatNum = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xl};
`;

const StatLabel = styled.div`
  margin-top: ${({ theme }) => theme.space(1)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g68};
`;

const AvgTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g76};
`;

const AvgNum = styled.span`
  color: ${({ theme }) => theme.colors.fg};
`;

const Meter = styled.div`
  position: relative;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.colors.g12};
  overflow: hidden;
`;

const MeterFill = styled(motion.div)`
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

const TopLaws = styled.div`
  display: flex;
  flex-direction: column;
`;

const LawRow = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
  padding: ${({ theme }) => theme.space(2.5)} 0;
  color: ${({ theme }) => theme.colors.g90};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;

const LawText = styled.div`
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSize.sm};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LawVal = styled.span`
  flex-shrink: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g68};
`;

const CityList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space(1.5)};
`;

const CityChip = styled.button<{ $active: boolean }>`
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

const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${({ theme }) => theme.space(6)};
  color: ${({ theme }) => theme.colors.fg};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.md};
  line-height: 1.5;
  max-width: 220px;
  margin: 0 auto;
`;

const RetryState = styled(Empty)`
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
`;

/** Fines readout in the rail. Present on every layer, not just the Fines one. */
const FineRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g76};
`;

const FineNum = styled.span`
  color: ${({ theme }) => theme.colors.penalty};
`;

const AVG_BY_AXIS = {
  opacity: "avgOpacity",
  enforcementDiscretion: "avgEnforcementDiscretion",
  paternalism: "avgPaternalism",
  problemSalience: "avgProblemSalience",
} as const;

function clampPct(v: number): number {
  const { min, max } = DEFAULT_SCORE_RANGE;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isCompact;
}

function AggregatePanel({ placement }: { placement: "rail" | "mobile" }) {
  const { state, dispatch } = useExplorer();
  const {
    data: jurisdictions,
    status: jurisdictionsStatus,
    retry,
    stateDetail,
    stateDetailStatus,
    countyDetail,
    countyDetailStatus,
  } = useJurisdictions();
  const { selectedState, unhinged, filters } = state;
  const selectedCounty = filters.county;
  const selectedCity = filters.city;

  const scoped = Boolean(selectedState && selectedCounty);
  const detail = scoped ? countyDetail : stateDetail;
  const detailStatus = scoped ? countyDetailStatus : stateDetailStatus;
  const countySlug =
    selectedCounty && stateDetail
      ? matchCountySlug(stateDetail.counties, selectedCounty)
      : null;
  const countyAggFromState = countySlug
    ? (stateDetail?.counties.find((c) => c.county === countySlug) ?? null)
    : null;

  const agg = selectedState
    ? (detail?.jurisdiction ?? countyAggFromState ?? null)
    : (jurisdictions?.national ?? null);
  const topLaws = selectedState ? (detail?.topLaws ?? []) : [];
  const topCities = selectedState
    ? (detail?.topCities ?? stateDetail?.topCities ?? [])
    : [];
  const loading = selectedState
    ? detailStatus === "loading" && !agg
    : jurisdictionsStatus === "loading";
  const nationalError = !selectedState && jurisdictionsStatus === "error";
  const label = selectedCounty
    ? prettySlug(selectedCounty)
    : selectedState
      ? stateName(selectedState)
      : "United States";
  const panelKey = `${selectedState ?? "national"}:${selectedCounty ?? ""}`;

  return (
    <Panel as="aside" $placement={placement} aria-label={`${label} aggregate insights`}>
      <Header $align="baseline" $gap={2}>
        <Heading $size="lg">{label}</Heading>
        {selectedState && (
          <Clear
            type="button"
            $variant="subtle"
            $size="sm"
            onClick={() => dispatch({ type: "selectState", state: null })}
          >
            Clear
          </Clear>
        )}
      </Header>
      <AnimatePresence mode="wait">
        <Inner
          as={motion.div}
          key={panelKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {nationalError ? (
            <RetryState>
              <span>Aggregate data unavailable.</span>
              <Clear
                type="button"
                $variant="subtle"
                $size="sm"
                onClick={retry}
              >
                Retry
              </Clear>
            </RetryState>
          ) : loading ? (
            <Empty>Loading…</Empty>
          ) : !agg ? (
            <Empty>No aggregate data yet for {label}.</Empty>
          ) : (
            <>
              <CountRow>
                <Stat>
                  <StatNum>{agg.lawCount.toLocaleString()}</StatNum>
                  <StatLabel>Laws</StatLabel>
                </Stat>
                <Stat>
                  <StatNum>{agg.substantiveCount.toLocaleString()}</StatNum>
                  <StatLabel>Substantive</StatLabel>
                </Stat>
              </CountRow>

              <SectionLabel>{ui("Average scores", unhinged)}</SectionLabel>
              <Stack $gap={3}>
                {AXES.map((a) => {
                  const value = agg[AVG_BY_AXIS[a.key]];
                  return (
                    <Stack key={a.key} $gap={1.5}>
                      <AvgTop>
                        <span>{resolveAxisCopy(a.key, unhinged).label}</span>
                        <AvgNum>{value.toFixed(2)}</AvgNum>
                      </AvgTop>
                      <Meter>
                        <MeterFill
                          initial={{ width: 0 }}
                          animate={{ width: `${clampPct(value)}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </Meter>
                    </Stack>
                  );
                })}
              </Stack>

              {agg.penalties && agg.penalties.penaltySections > 0 && (
                <>
                  <SectionLabel>{ui("Fines", unhinged)}</SectionLabel>
                  <Stack $gap={2}>
                    <FineRow>
                      <span>Typical fine</span>
                      <FineNum>
                        {agg.penalties.medianFine === null
                          ? "—"
                          : formatFine(agg.penalties.medianFine)}
                      </FineNum>
                    </FineRow>
                    <FineRow>
                      <span>Name a fine</span>
                      <FineNum>
                        {(() => {
                          const share = amountShare(agg.penalties);
                          return share === null ? "—" : formatShare(share);
                        })()}
                      </FineNum>
                    </FineRow>
                    <FineRow>
                      <span>Sections read</span>
                      <AvgNum>
                        {agg.penalties.penaltySections.toLocaleString()}
                      </AvgNum>
                    </FineRow>
                  </Stack>
                </>
              )}

              {topCities.length > 0 && (
                <>
                  <SectionLabel>{ui("Cities", unhinged)}</SectionLabel>
                  <CityList>
                    {topCities.map((c) => {
                      const active = selectedCity === c.city;
                      return (
                        <CityChip
                          key={c.city}
                          type="button"
                          $active={active}
                          onClick={() =>
                            dispatch({
                              type: "patchFilters",
                              filters: active
                                ? { city: undefined }
                                : { city: c.city },
                            })
                          }
                        >
                          {prettySlug(c.city)}
                        </CityChip>
                      );
                    })}
                  </CityList>
                </>
              )}

              {topLaws.length > 0 && (
                <>
                  <SectionLabel>{ui("Notable laws", unhinged)}</SectionLabel>
                  <TopLaws>
                    {topLaws.map((law) => (
                      <LawRow
                        key={law.id}
                        type="button"
                        onClick={() => dispatch({ type: "openLaw", law })}
                      >
                        <LawText>
                          {law.header?.trim() ? (
                            <LawMarkdown compact title>
                              {law.header}
                            </LawMarkdown>
                          ) : (
                            "Untitled provision"
                          )}
                        </LawText>
                        <LawVal>{law[state.axis].toFixed(2)}</LawVal>
                      </LawRow>
                    ))}
                  </TopLaws>
                </>
              )}
            </>
          )}
        </Inner>
      </AnimatePresence>
    </Panel>
  );
}

export function AggregateRail() {
  const isCompact = useCompactLayout();
  if (isCompact) return null;
  return <AggregatePanel placement="rail" />;
}

/** Selected/national aggregate profile inserted between map and results on compact screens. */
export function JurisdictionPanel() {
  const isCompact = useCompactLayout();
  const { state } = useExplorer();
  if (!isCompact || !state.selectedState) return null;
  return <AggregatePanel placement="mobile" />;
}
