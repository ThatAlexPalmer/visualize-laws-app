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
  type JurisdictionDetailResponse,
} from "@/lib/types";

const Panel = styled.aside`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
  min-height: 320px;
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(2)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
`;

const Name = styled.div`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
`;

const Clear = styled.button`
  background: transparent;
  border: 0;
  color: ${({ theme }) => theme.colors.g48};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;

const Inner = styled(motion.div)`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ theme }) => theme.space(4)};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(4)};
`;

const CountRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space(3)};
`;

const Stat = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.sm};
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
  color: ${({ theme }) => theme.colors.g48};
`;

const SectionLabel = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
`;

const Averages = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(3)};
`;

const Avg = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(1.5)};
`;

const AvgTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g64};
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
  color: ${({ theme }) => theme.colors.g80};
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
  color: ${({ theme }) => theme.colors.g48};
`;

const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${({ theme }) => theme.space(6)};
  color: ${({ theme }) => theme.colors.g32};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
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

export function JurisdictionPanel() {
  const { state, dispatch } = useExplorer();
  const { selectedState } = state;

  const [data, setData] = useState<JurisdictionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedState) {
      setData(null);
      return;
    }
    let ignore = false;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/jurisdictions/${encodeURIComponent(selectedState)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<JurisdictionDetailResponse>) : null))
      .then((json) => {
        if (ignore) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (ignore || ctrl.signal.aborted) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      ignore = true;
      ctrl.abort();
    };
  }, [selectedState]);

  if (!selectedState) {
    return (
      <Panel>
        <Empty>Select a state on the map to see its profile.</Empty>
      </Panel>
    );
  }

  const agg = data?.jurisdiction ?? null;
  const topLaws = data?.topLaws ?? [];

  return (
    <Panel>
      <Header>
        <Name>{stateName(selectedState)}</Name>
        <Clear type="button" onClick={() => dispatch({ type: "selectState", state: null })}>
          Clear
        </Clear>
      </Header>
      <AnimatePresence mode="wait">
        <Inner
          key={selectedState}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {loading && !agg ? (
            <Empty>Loading…</Empty>
          ) : !agg ? (
            <Empty>No aggregate data yet for {stateName(selectedState)}.</Empty>
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

              <SectionLabel>Average scores</SectionLabel>
              <Averages>
                {AXES.map((a) => {
                  const value = agg[AVG_BY_AXIS[a.key]];
                  return (
                    <Avg key={a.key}>
                      <AvgTop>
                        <span>{a.label}</span>
                        <AvgNum>{value.toFixed(2)}</AvgNum>
                      </AvgTop>
                      <Meter>
                        <MeterFill
                          initial={{ width: 0 }}
                          animate={{ width: `${clampPct(value)}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </Meter>
                    </Avg>
                  );
                })}
              </Averages>

              {topLaws.length > 0 && (
                <>
                  <SectionLabel>Notable laws</SectionLabel>
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
