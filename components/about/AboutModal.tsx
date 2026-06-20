"use client";

// STUB (owned by agent-ui). Replace with the animated About panel. Already wires
// the REQUIRED attribution: BibTeX citation + paper, dataset, and tweet links.
import styled from "styled-components";
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

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.z.modal};
`;

const Card = styled.div`
  max-width: 640px;
  width: 90%;
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space(6)};
`;

const Cite = styled.pre`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  white-space: pre-wrap;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => theme.space(3)};
`;

const Links = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space(4)};
  flex-wrap: wrap;
  a { text-decoration: underline; }
`;

export function AboutModal() {
  const { state, dispatch } = useExplorer();
  if (!state.aboutOpen) return null;
  return (
    <Overlay onClick={() => dispatch({ type: "setAbout", open: false })}>
      <Card onClick={(e) => e.stopPropagation()}>
        <h3>About LOCUS Explorer</h3>
        <p>
          Built on the{" "}
          <a href={DATASET_URL} target="_blank" rel="noreferrer">
            LOCUS-v1
          </a>{" "}
          corpus of ~2.2M U.S. local laws.
        </p>
        <Cite>{BIBTEX}</Cite>
        <Links>
          <a href={PAPER_URL} target="_blank" rel="noreferrer">
            Paper
          </a>
          <a href={DATASET_URL} target="_blank" rel="noreferrer">
            Models &amp; Dataset
          </a>
          {TWEET_URL ? (
            <a href={TWEET_URL} target="_blank" rel="noreferrer">
              Announcement
            </a>
          ) : null}
        </Links>
      </Card>
    </Overlay>
  );
}
