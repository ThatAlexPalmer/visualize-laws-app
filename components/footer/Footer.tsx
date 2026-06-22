"use client";

// App credit footer: this app is by thatalexpalmer / PALMER.EARTH CORP — distinct
// from the LOCUS dataset + research it builds on (credited on /about).
import styled from "styled-components";
import { APP_AUTHOR, APP_AUTHOR_URL, COPYRIGHT, AUTHOR_NAME, AUTHOR_URL } from "@/lib/attribution";
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
`;

export function Footer() {
  return (
    <Bar>
      <span>
        data by{" "}
        <MonoLink href={AUTHOR_URL} target="_blank" rel="noreferrer" $size="xs">
          {AUTHOR_NAME} ↗
        </MonoLink>
        {" · "}
        app by{" "}
        <MonoLink href={APP_AUTHOR_URL} target="_blank" rel="noreferrer" $size="xs">
          {APP_AUTHOR} ↗
        </MonoLink>
      </span>
      <span>{COPYRIGHT}</span>
    </Bar>
  );
}
