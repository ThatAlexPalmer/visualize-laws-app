"use client";

import Link from "next/link";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer/Footer";
import { RELEASES } from "@/lib/releases";
import { Heading, Kicker as UiKicker, MonoLink, Muted } from "@/components/ui/text";
import { useExplorer } from "@/lib/store";
import { ui } from "@/lib/copy";

const Page = styled.div`
  height: 100%;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bg};
`;

const Inner = styled(motion.main)`
  max-width: 760px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space(8)} ${({ theme }) => theme.space(5)}
    ${({ theme }) => theme.space(16)};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space(6)} ${({ theme }) => theme.space(4)}
      ${({ theme }) => theme.space(12)};
  }
`;

const TopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: ${({ theme }) => theme.space(8)};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    display: none;
  }
`;

const Kicker = styled(UiKicker)`
  letter-spacing: 0.18em;
`;

const H1 = styled(Heading)`
  font-size: ${({ theme }) => theme.fontSize.xxl};
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-weight: ${({ theme }) => theme.fontWeights.bold};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    font-size: clamp(2rem, 11vw, 2.7rem);
  }
`;

const Lede = styled(Muted)`
  margin: ${({ theme }) => theme.space(5)} 0 0;
  font-size: ${({ theme }) => theme.fontSize.lg};
`;

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

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};

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
    <Page>
      <Inner variants={container} initial="hidden" animate="show">
        <TopRow>
          <MonoLink as={Link} href="/">
            {ui("← back to the map", unhinged)}
          </MonoLink>
          <Kicker>{ui("Release log", unhinged)}</Kicker>
        </TopRow>

        <motion.section variants={item}>
          <H1 as="h1">{ui("Release log", unhinged)}</H1>
          <Lede>{ui("What you can do in each version.", unhinged)}</Lede>
        </motion.section>

        <List>
          {RELEASES.map((release) => (
            <Version key={release.version} as={motion.li} variants={item}>
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
      </Inner>
      <Footer />
    </Page>
  );
}
