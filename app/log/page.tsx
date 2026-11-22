"use client";

import styled from "styled-components";
import { motion } from "framer-motion";
import { ArticlePage, articleItem } from "@/components/layout/ArticlePage";
import { RELEASES } from "@/lib/releases";
import { MonoLink } from "@/components/ui/text";
import { useExplorer } from "@/lib/store";
import { ui } from "@/lib/copy";

const List = styled.ol`
  list-style: none;
  margin: ${({ theme }) => theme.space(10)} 0 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space(8)};
`;

const Version = styled.li`
  padding-top: ${({ theme }) => theme.space(6)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
`;

const VersionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  font-family: ${({ theme }) => theme.font.mono};
`;

const VersionId = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.04em;
`;

const VersionDate = styled.time`
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.g68};
`;

const Notes = styled.ul`
  margin: ${({ theme }) => theme.space(4)} 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: ${({ theme }) => theme.space(2)};
`;

const Note = styled.li`
  position: relative;
  padding-left: ${({ theme }) => theme.space(4)};
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.g90};

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.65em;
    width: 6px;
    height: 1px;
    background: ${({ theme }) => theme.colors.g60};
  }
`;

const ReleaseLink = styled(MonoLink)`
  display: inline-block;
  margin-top: ${({ theme }) => theme.space(4)};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
`;

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function LogPage() {
  const { state } = useExplorer();
  const unhinged = state.unhinged;

  return (
    <ArticlePage
      back={ui("← back to the map", unhinged)}
      kicker={ui("Release log", unhinged)}
      title={ui("Release log", unhinged)}
      lede={ui("What you can do in each version.", unhinged)}
      align="baseline"
      titleGap={false}
    >
        <List>
          {RELEASES.map((release) => (
            <Version key={release.version} as={motion.li} variants={articleItem}>
              <VersionHead>
                <VersionId>{release.version}</VersionId>
                <VersionDate dateTime={release.released}>
                  {formatDate(release.released)}
                </VersionDate>
              </VersionHead>
              <Notes>
                {release.notes.map((note) => (
                  <Note key={note}>{note}</Note>
                ))}
              </Notes>
              <ReleaseLink
                href={release.href}
                target="_blank"
                rel="noreferrer"
              >
                {ui("GitHub release", unhinged)} ↗
              </ReleaseLink>
            </Version>
          ))}
        </List>
    </ArticlePage>
  );
}
