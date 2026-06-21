"use client";

// App credit footer: this app is by thatalexpalmer / PALMER.EARTH CORP — distinct
// from the LOCUS dataset + research it builds on (credited on /about).
import styled from "styled-components";
import { APP_AUTHOR, APP_AUTHOR_URL, COPYRIGHT } from "@/lib/attribution";

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
  color: ${({ theme }) => theme.colors.g48};

  a {
    color: ${({ theme }) => theme.colors.g64};
    transition: color ${({ theme }) => theme.motion.fast}s ease;
  }
  a:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;

export function Footer() {
  return (
    <Bar>
      <span>
        app by{" "}
        <a href={APP_AUTHOR_URL} target="_blank" rel="noreferrer">
          {APP_AUTHOR} &nearr;
        </a>
      </span>
      <span>{COPYRIGHT}</span>
    </Bar>
  );
}
