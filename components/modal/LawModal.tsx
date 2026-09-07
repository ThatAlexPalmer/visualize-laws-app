"use client";

// Animated detail modal for a single law. Summary metadata comes from the list
// response; the full body is fetched on demand after the modal opens.
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  penaltyAbsenceLabel,
  penaltyAmountLabel,
  penaltyCaveat,
  prettySlug,
  stateName,
  type LawDetailResponse,
  type LawFines,
  type LawRecord,
} from "@/lib/types";
import { resolveAxisCopy } from "@/lib/copy";
import { Button, IconButton } from "@/components/ui/buttons";
import { Card as CardBase, Cluster } from "@/components/ui/containers";
import { ScoreMeter } from "@/components/ui/ScoreMeter";
import { LawMarkdown } from "@/components/law/LawMarkdown";
import { Heading, Mono } from "@/components/ui/text";

const Overlay = styled(motion.dialog)`
  position: fixed;
  inset: 0;
  margin: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border: 0;
  color: inherit;
  &:not([open]) { display: none; }
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space(4)};
  z-index: ${({ theme }) => theme.z.modal};
`;

// The dialog surface uses the same square structural treatment as the explorer
// panels while retaining rounded chips and compact actions inside it.
const Card = styled(CardBase)`
  position: relative;
  max-width: 720px;
  width: 100%;
  max-height: 84vh;
  overflow-y: auto;
  border-color: ${({ theme }) => theme.colors.g20};
  border-radius: 0;
  padding: ${({ theme }) => theme.space(6)};
`;

const Close = styled(IconButton)`
  position: absolute;
  top: ${({ theme }) => theme.space(4)};
  right: ${({ theme }) => theme.space(4)};
`;

const Title = styled(Heading)`
  margin: 0 ${({ theme }) => theme.space(8)} ${({ theme }) => theme.space(2)} 0;
  line-height: 1.25;
`;

const Sub = styled(Mono)`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g68};
  letter-spacing: 0.04em;
`;

const Chips = styled(Cluster)`
  margin-top: ${({ theme }) => theme.space(4)};
`;

const Chip = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(2.5)};
  color: ${({ theme }) => theme.colors.g90};
`;

const ScoreGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.space(3)};
  margin: ${({ theme }) => theme.space(5)} 0;

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    grid-template-columns: 1fr;
  }
`;

const Body = styled.div`
  margin-top: ${({ theme }) => theme.space(4)};
  padding-top: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.g90};
  font-size: ${({ theme }) => theme.fontSize.md};
`;

const Penalty = styled.section`
  margin-top: ${({ theme }) => theme.space(5)};
  padding-top: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
`;

const PenaltyHead = styled(Mono)`
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g60};
`;

const PenaltyAmount = styled.div`
  margin-top: ${({ theme }) => theme.space(2)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xl};
  color: ${({ theme }) => theme.colors.fg};
  line-height: 1.15;
`;

const PenaltyNone = styled.div`
  margin-top: ${({ theme }) => theme.space(2)};
  color: ${({ theme }) => theme.colors.g76};
  font-size: ${({ theme }) => theme.fontSize.md};
`;

const PenaltyNote = styled.p`
  margin: ${({ theme }) => theme.space(3)} 0 0;
  font-size: ${({ theme }) => theme.fontSize.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.g60};
`;

const Caveat = styled(PenaltyNote)`
  padding-left: ${({ theme }) => theme.space(3)};
  border-left: 1px solid ${({ theme }) => theme.colors.g20};
  color: ${({ theme }) => theme.colors.g76};
`;

const SCOPE_LABEL: Record<string, string> = {
  code_general: "Applies code-wide",
  chapter_general: "Applies to this chapter",
  specific: "Applies to specific conduct",
};

const NATURE_LABEL: Record<string, string> = {
  criminal: "Criminal",
  civil: "Civil",
  both: "Criminal and civil",
};

/**
 * Penalty annotation from LOCUS-Fines. Rendered only when the supplement's
 * model actually read this law; the caller passes null otherwise, because an
 * absent annotation means "not read", not "no penalty".
 */
function PenaltyBlock({ fines }: { fines: LawFines }) {
  const amount = penaltyAmountLabel(fines);
  const caveat = penaltyCaveat(fines);
  const scope = fines.penaltyScope ? SCOPE_LABEL[fines.penaltyScope] : null;
  const nature = fines.penaltyNature ? NATURE_LABEL[fines.penaltyNature] : null;

  const tags = [
    nature,
    fines.perDayViolation ? "Each day is a separate violation" : null,
    fines.jailMentioned ? "Jail mentioned" : null,
  ].filter((t): t is string => Boolean(t));

  return (
    <Penalty aria-label="Stated fine">
      <PenaltyHead as="h4">Fines</PenaltyHead>
      {amount ? (
        <PenaltyAmount>{amount}</PenaltyAmount>
      ) : (
        <PenaltyNone>{penaltyAbsenceLabel(fines)}</PenaltyNone>
      )}
      {(scope || tags.length > 0) && (
        <Chips>
          {scope && <Chip>{scope}</Chip>}
          {tags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </Chips>
      )}
      {caveat && <Caveat>{caveat}</Caveat>}
      <PenaltyNote>
        Taken from the section text. The dollar amount is checked against the
        wording; the tags are a best guess.
      </PenaltyNote>
    </Penalty>
  );
}

const BodyStatus = styled(Body)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space(3)};
  color: ${({ theme }) => theme.colors.g68};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function LawModal() {
  const { state, dispatch } = useExplorer();
  const { unhinged } = state;
  const law = state.selectedLaw;
  const [detail, setDetail] = useState<LawRecord | null>(null);
  const [fines, setFines] = useState<LawFines | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const close = () => dispatch({ type: "closeLaw" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = Boolean(law);

  useEffect(() => {
    if (!law) {
      setDetail(null);
      setFines(null);
      setDetailError(false);
      return;
    }

    const ctrl = new AbortController();
    let active = true;
    setDetail(null);
    setFines(null);
    setDetailError(false);

    fetch(`/api/laws/${law.id}`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LawDetailResponse>;
      })
      .then(({ law: fullLaw, fines: lawFines }) => {
        if (!active) return;
        setDetail(fullLaw);
        setFines(lawFines ?? null);
      })
      .catch(() => {
        if (!active || ctrl.signal.aborted) return;
        setDetailError(true);
      });

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [law, retryAttempt]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previous = document.activeElement;
    // Native modal dialogs trap focus and make the background inert.
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {law && (
        <Overlay
          key="law-overlay"
          ref={dialogRef}
          aria-label={(detail ?? law).header ?? "Law detail"}
          aria-modal="true"
          onCancel={(event) => { event.preventDefault(); close(); }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
            )).filter((element) => element.getClientRects().length > 0);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
        >
          <Card
            as={motion.div}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Close type="button" aria-label="Close" autoFocus onClick={close}>
              ×
            </Close>
            <Title as="h3" $size="xl">
              {(detail ?? law).header?.trim() ? (
                <LawMarkdown title>{(detail ?? law).header ?? ""}</LawMarkdown>
              ) : (
                "Untitled provision"
              )}
            </Title>
            <Sub>
              {stateName((detail ?? law).state)}
              {(detail ?? law).county
                ? ` · ${prettySlug((detail ?? law).county)}`
                : ""}
              {(detail ?? law).city
                ? ` · ${prettySlug((detail ?? law).city)}`
                : ""}
              {(detail ?? law).sourceJurisdictionType
                ? ` · ${(detail ?? law).sourceJurisdictionType}`
                : ""}
            </Sub>

            <Chips>
              <Chip>{(detail ?? law).isSubstantive ? "Substantive" : "Procedural"}</Chip>
              {(detail ?? law).function && <Chip>{(detail ?? law).function}</Chip>}
              {(detail ?? law).topic && <Chip>{(detail ?? law).topic}</Chip>}
            </Chips>

            <ScoreGrid>
              {AXES.map((a) => (
                <ScoreMeter
                  key={a.key}
                  label={resolveAxisCopy(a.key, unhinged).label}
                  value={(detail ?? law)[a.key]}
                />
              ))}
            </ScoreGrid>

            {fines && <PenaltyBlock fines={fines} />}

            {detail ? (
              <Body>
                <LawMarkdown>{detail.content}</LawMarkdown>
              </Body>
            ) : detailError ? (
              <BodyStatus role="alert">
                <span>Could not load the full law text.</span>
                <Button
                  type="button"
                  $variant="ghost"
                  $size="sm"
                  onClick={() => setRetryAttempt((attempt) => attempt + 1)}
                >
                  Retry
                </Button>
              </BodyStatus>
            ) : (
              <BodyStatus aria-live="polite">Loading full law text…</BodyStatus>
            )}
          </Card>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
