"use client";

// Animated detail modal for a single law. Driven by store.selectedLaw /
// closeLaw. Closes on overlay click or Escape.
import { useEffect } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import { AXES, DEFAULT_SCORE_RANGE, stateName } from "@/lib/types";

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space(4)};
  z-index: ${({ theme }) => theme.z.modal};
`;

const Card = styled(motion.div)`
  position: relative;
  max-width: 720px;
  width: 100%;
  max-height: 84vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space(6)};
`;

const Close = styled.button`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  right: ${({ theme }) => theme.space(4)};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.g20};
  color: ${({ theme }) => theme.colors.g64};
  border-radius: ${({ theme }) => theme.radius.pill};
  width: 28px;
  height: 28px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
    border-color: ${({ theme }) => theme.colors.g48};
  }
`;

const Title = styled.h3`
  margin: 0 ${({ theme }) => theme.space(8)} ${({ theme }) => theme.space(2)} 0;
  font-size: ${({ theme }) => theme.fontSize.xl};
  font-weight: 600;
  line-height: 1.25;
`;

const Sub = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g48};
  letter-spacing: 0.04em;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space(2)};
  margin-top: ${({ theme }) => theme.space(4)};
`;

const Chip = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(2.5)};
  color: ${({ theme }) => theme.colors.g80};
`;

const ScoreGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.space(3)};
  margin: ${({ theme }) => theme.space(5)} 0;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const ScoreItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(1.5)};
`;

const ScoreTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g64};
`;

const ScoreNum = styled.span`
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

const Body = styled.div`
  margin-top: ${({ theme }) => theme.space(4)};
  padding-top: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
  white-space: pre-wrap;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.g80};
  font-size: ${({ theme }) => theme.fontSize.md};
`;

function clampPct(v: number): number {
  const { min, max } = DEFAULT_SCORE_RANGE;
  const p = ((v - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, p));
}

export function LawModal() {
  const { state, dispatch } = useExplorer();
  const law = state.selectedLaw;
  const close = () => dispatch({ type: "closeLaw" });

  useEffect(() => {
    if (!law) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "closeLaw" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [law, dispatch]);

  return (
    <AnimatePresence>
      {law && (
        <Overlay
          key="law-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label={law.header ?? "Law detail"}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Close type="button" aria-label="Close" onClick={close}>
              ×
            </Close>
            <Title>{law.header?.trim() || "Untitled provision"}</Title>
            <Sub>
              {stateName(law.state)}
              {law.county ? ` · ${law.county}` : ""}
              {law.city ? ` · ${law.city}` : ""}
              {law.sourceJurisdictionType ? ` · ${law.sourceJurisdictionType}` : ""}
            </Sub>

            <Chips>
              <Chip>{law.isSubstantive ? "Substantive" : "Procedural"}</Chip>
              {law.function && <Chip>{law.function}</Chip>}
              {law.topic && <Chip>{law.topic}</Chip>}
            </Chips>

            <ScoreGrid>
              {AXES.map((a) => {
                const value = law[a.key];
                return (
                  <ScoreItem key={a.key}>
                    <ScoreTop>
                      <span>{a.label}</span>
                      <ScoreNum>{value.toFixed(2)}</ScoreNum>
                    </ScoreTop>
                    <Meter>
                      <MeterFill
                        initial={{ width: 0 }}
                        animate={{ width: `${clampPct(value)}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </Meter>
                  </ScoreItem>
                );
              })}
            </ScoreGrid>

            <Body>{law.content}</Body>
          </Card>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
