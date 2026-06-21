"use client";

// Animated About panel. Wires the REQUIRED attribution: BibTeX citation + paper,
// dataset, and (when configured) the announcement tweet. Closes on overlay click
// or Escape.
import { useEffect } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";

// Announcement tweet/X URL — fill in via NEXT_PUBLIC_TWEET_URL (pending).
export const TWEET_URL = process.env.NEXT_PUBLIC_TWEET_URL || "";
export const PAPER_URL = "https://arxiv.org/abs/2606.19334";
export const DATASET_URL = "https://huggingface.co/LocalLaws";

export const BIBTEX = `@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}`;

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
  max-width: 640px;
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
  margin: 0 0 ${({ theme }) => theme.space(3)} 0;
  font-size: ${({ theme }) => theme.fontSize.xl};
  font-weight: 600;
`;

const Para = styled.p`
  margin: 0 0 ${({ theme }) => theme.space(4)} 0;
  color: ${({ theme }) => theme.colors.g80};
  line-height: 1.6;
`;

const CiteLabel = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
  margin-bottom: ${({ theme }) => theme.space(2)};
`;

const Cite = styled.pre`
  margin: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  white-space: pre-wrap;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => theme.space(3)};
  color: ${({ theme }) => theme.colors.g80};
`;

const Links = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space(3)};
  flex-wrap: wrap;
  margin-top: ${({ theme }) => theme.space(5)};
`;

const LinkButton = styled(motion.a)`
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.fg};
`;

export function AboutModal() {
  const { state, dispatch } = useExplorer();
  const open = state.aboutOpen;
  const close = () => dispatch({ type: "setAbout", open: false });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "setAbout", open: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  return (
    <AnimatePresence>
      {open && (
        <Overlay
          key="about-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label="About LOCUS Explorer"
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Close type="button" aria-label="Close" onClick={close}>
              ×
            </Close>
            <Title>About LOCUS Explorer</Title>
            <Para>
              An interactive window into the{" "}
              <a href={DATASET_URL} target="_blank" rel="noreferrer">
                LOCUS-v1
              </a>{" "}
              corpus — ~2.2M U.S. local laws, each scored along four axes: opacity,
              enforcement discretion, paternalism, and problem salience. Search
              the full text, filter by score and jurisdiction, and explore
              state-level patterns on the map.
            </Para>
            <CiteLabel>Please cite</CiteLabel>
            <Cite>{BIBTEX}</Cite>
            <Links>
              <LinkButton
                href={PAPER_URL}
                target="_blank"
                rel="noreferrer"
                whileHover={{ borderColor: "rgba(255,255,255,0.48)" }}
                whileTap={{ scale: 0.97 }}
              >
                Paper ↗
              </LinkButton>
              <LinkButton
                href={DATASET_URL}
                target="_blank"
                rel="noreferrer"
                whileHover={{ borderColor: "rgba(255,255,255,0.48)" }}
                whileTap={{ scale: 0.97 }}
              >
                Models &amp; Dataset ↗
              </LinkButton>
              {TWEET_URL ? (
                <LinkButton
                  href={TWEET_URL}
                  target="_blank"
                  rel="noreferrer"
                  whileHover={{ borderColor: "rgba(255,255,255,0.48)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Announcement ↗
                </LinkButton>
              ) : null}
            </Links>
          </Card>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
