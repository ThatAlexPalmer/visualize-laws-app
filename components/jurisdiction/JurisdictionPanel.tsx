"use client";

// Jurisdiction dashboard: aggregate stats + top laws from
// GET /api/jurisdictions/[state] when a state is selected. Tolerates an empty DB
// (jurisdiction === null) and shows an empty state when nothing is selected.
import { useEffect, useState } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  DEFAULT_SCORE_RANGE,
  stateName,
  type JurisdictionAgg,
  type JurisdictionDetailResponse,
  type JurisdictionsResponse,
  type LawSummary,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { Button } from "@/components/ui/buttons";
import {
  Card,
  Panel as PanelBase,
  Row,
  ScrollArea,
  SectionLabel,
  Stack,
} from "@/components/ui/containers";
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

const LawText = styled.span`
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

interface AggregateState {
  aggregate: JurisdictionAgg | null;
  topLaws: LawSummary[];
}

function AggregatePanel({ placement }: { placement: "rail" | "mobile" }) {
  const { state, dispatch } = useExplorer();
  const { selectedState, unhinged } = state;

  const [data, setData] = useState<AggregateState>({ aggregate: null, topLaws: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const ctrl = new AbortController();
    setLoading(true);
    const url = selectedState
      ? `/api/jurisdictions/${encodeURIComponent(selectedState)}`
      : "/api/jurisdictions";
    fetch(url, {
      signal: ctrl.signal,
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<JurisdictionDetailResponse | JurisdictionsResponse>)
          : null,
      )
      .then((json) => {
        if (ignore) return;
        if (!json) {
          setData({ aggregate: null, topLaws: [] });
        } else if (selectedState) {
          const detail = json as JurisdictionDetailResponse;
          setData({ aggregate: detail.jurisdiction, topLaws: detail.topLaws });
        } else {
          setData({
            aggregate: (json as JurisdictionsResponse).national,
            topLaws: [],
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (ignore || ctrl.signal.aborted) return;
        setData({ aggregate: null, topLaws: [] });
        setLoading(false);
      });
    return () => {
      ignore = true;
      ctrl.abort();
    };
  }, [selectedState]);

  const agg = data.aggregate;
  const topLaws = data.topLaws;
  const label = selectedState ? stateName(selectedState) : "United States";

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
          key={selectedState ?? "national"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {loading ? (
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
                        <LawText>{law.header?.trim() || "Untitled provision"}</LawText>
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
