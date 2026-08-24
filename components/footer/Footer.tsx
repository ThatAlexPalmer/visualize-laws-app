"use client";

// App credit footer: this app is by thatalexpalmer / PALMER.EARTH CORP — distinct
// from the LOCUS dataset + research it builds on (credited on /about).
import Link from "next/link";
import styled from "styled-components";
import {
  APP_AUTHOR,
  APP_AUTHOR_URL,
  COPYRIGHT,
  AUTHOR_NAME,
  REPOSITORY_URL,
  TWEET_URL,
} from "@/lib/attribution";
import { ui } from "@/lib/copy";
import { useExplorer } from "@/lib/store";
import { MonoLink } from "@/components/ui/text";

const Bar = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  flex-wrap: wrap;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(5)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g68};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    align-items: flex-start;
    flex-direction: column;
    gap: ${({ theme }) => theme.space(1)};
    padding: ${({ theme }) => theme.space(2)} ${({ theme }) => theme.space(3)};
    font-size: 10px;
  }
`;

export function Footer() {
  const { state } = useExplorer();
  return (
    <Bar>
      <span>
        data by{" "}
        <MonoLink href={TWEET_URL} target="_blank" rel="noreferrer" $size="xs">
          {AUTHOR_NAME} ↗
        </MonoLink>
        {" · "}
        app by{" "}
        <MonoLink href={APP_AUTHOR_URL} target="_blank" rel="noreferrer" $size="xs">
          {APP_AUTHOR} ↗
        </MonoLink>
        {" · "}
        <MonoLink href={REPOSITORY_URL} target="_blank" rel="noreferrer" $size="xs">
          GitHub ↗
        </MonoLink>
        {" · "}
        <MonoLink as={Link} href="/log" $size="xs">
          {ui("log", state.unhinged)}
        </MonoLink>
      </span>
      <span>{COPYRIGHT}</span>
    </Bar>
  );
}
