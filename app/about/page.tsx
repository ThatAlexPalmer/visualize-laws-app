"use client";

// /about — product mission, current LOCUS-v1 coverage, legal-layer roadmap,
// and dataset attribution. Reached from the nav "About" link.
import Link from "next/link";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer/Footer";
import {
  BIBTEX,
  DATASET_URL,
  PAPER_URL,
} from "@/lib/attribution";
import { ButtonLink } from "@/components/ui/buttons";
import { Cluster, Row, SectionLabel, Stack } from "@/components/ui/containers";
import { Heading, Kicker as UiKicker, MonoLink, Muted } from "@/components/ui/text";
import { useExplorer } from "@/lib/store";

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

const TopRow = styled(Row)`
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space(8)};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    display: none;
  }
`;

// Same mono micro-label as the rest of the app, with the wider /about tracking.
const Kicker = styled(UiKicker)`
  letter-spacing: 0.18em;
`;

const Section = styled(motion.section)`
  margin-top: ${({ theme }) => theme.space(10)};
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

const H2 = styled(Heading)`
  margin: 0 0 ${({ theme }) => theme.space(4)};
  font-size: ${({ theme }) => theme.fontSize.xl};
`;

const Body = styled(Muted)`
  margin: ${({ theme }) => theme.space(3)} 0 0;
  line-height: 1.65;
`;

const Tier = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.fg : theme.colors.g12)};
  border-radius: 0;
  background: ${({ theme, $active }) => ($active ? theme.colors.fg : "transparent")};
  color: ${({ theme, $active }) => ($active ? theme.colors.bg : theme.colors.fg)};
`;

const TierName = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: 600;
  letter-spacing: 0.06em;
`;

const TierMeta = styled.span<{ $active?: boolean }>`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme, $active }) => ($active ? theme.colors.bg : theme.colors.g68)};
  text-align: right;
`;

const Note = styled(Muted)`
  margin: ${({ theme }) => theme.space(4)} 0 0;
  color: ${({ theme }) => theme.colors.g76};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const CoverList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: ${({ theme }) => theme.space(2)};
`;

const CoverItem = styled.li`
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: ${({ theme }) => theme.space(3)};
  padding: ${({ theme }) => theme.space(2)} 0;
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
  line-height: 1.5;

  b {
    font-weight: 600;
  }
  span {
    color: ${({ theme }) => theme.colors.g76};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space(1)};
  }
`;

// The primary call-to-action reuses the primary ButtonLink (fg fill, pill).
const Cta = styled(ButtonLink)`
  margin-top: ${({ theme }) => theme.space(5)};
  padding: ${({ theme }) => theme.space(2.5)} ${({ theme }) => theme.space(5)};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const CiteLabel = styled(SectionLabel)`
  margin-bottom: ${({ theme }) => theme.space(2)};
`;

const Cite = styled.pre`
  margin: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  white-space: pre-wrap;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: 0;
  padding: ${({ theme }) => theme.space(3)};
  color: ${({ theme }) => theme.colors.g90};
`;

const Links = styled(Cluster)`
  margin-top: ${({ theme }) => theme.space(4)};
`;

// External resource links reuse the ghost ButtonLink (pill, g20 border → g48).
const LinkButton = styled(ButtonLink)`
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
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

const COVERS: [string, string][] = [
  ["Zoning & land use", "what you can build — and whether your block gets a taco truck"],
  ["Noise", "quiet hours, and how early the leaf blower may legally ruin a Saturday"],
  ["Parking", "street-sweeping tickets, permit zones, snow-emergency towing"],
  ["Building codes", "so the deck stays a deck and not a headline"],
  ["Animal control", "leash laws, pet limits, the eternal \u201care chickens allowed?\u201d debate"],
  ["Business licensing", "restaurants, vendors, and the neighbor\u2019s Airbnb empire"],
  ["Public health & safety", "smoking bans, pool fences, food-truck rules"],
  ["Property maintenance", "tall grass, junk cars, and the right to be annoyed by both"],
];

const FUNNY_COVERS: [string, string][] = [
  ["Zoning & land use", "the city deciding whether your dream project is a home or a paperwork event"],
  ["Noise", "the exact hour your neighbor's leaf blower becomes a matter of law"],
  ["Parking", "a municipal thriller starring permits, snow routes, and one missing sign"],
  ["Building codes", "keeping the deck attached to the house and out of the evening news"],
  ["Animal control", "leashes, pet limits, and the constitutional status of backyard chickens"],
  ["Business licensing", "permission slips for restaurants, vendors, and the Airbnb next door"],
  ["Public health & safety", "pool fences, smoking rules, and whether the food truck may park there"],
  ["Property maintenance", "when tall grass stops being landscaping and becomes government business"],
];

const NORMAL_COPY = {
  back: "← back to the map",
  kicker: "ABOUT",
  title: "Visualizing laws and their characteristics",
  lede:
    "Visualize Laws turns legal text into something you can map, search, sort, and compare. Each law is scored across opacity, enforcement discretion, paternalism, and problem salience — four ways of seeing how a rule reads, what it permits, and what problem it is trying to solve.",
  layersTitle: "Three layers of U.S. law, starting local",
  layersBody:
    "U.S. law operates across federal, state, and local layers. This first version begins with local law because LOCUS-v1 provides a uniquely broad, structured corpus of ordinances from cities and counties across the country.",
  federal: "FEDERAL",
  federalMeta: "U.S. Congress · the whole country",
  state: "STATE",
  stateMeta: "state legislature · one entire state",
  local: "LOCAL ← CURRENT COVERAGE",
  localMeta: "city / county council · your town",
  layersNote:
    "A local ordinance is a law made by a city or county, applying inside that jurisdiction. It is the hyper-local fine print governing everything from zoning and business licensing to backyard chickens and late-night noise. Local rules remain subject to state and federal law.",
  governsTitle: "What they actually govern",
  governsBody: "Dull name, surprisingly personal reach. Local codes usually cover:",
  whyTitle: "Why bother with them at all?",
  whyBody:
    "Because a dense city and a rural town want wildly different things. One needs rules for short-term rentals and 2 a.m. noise; the other cares about ATVs and livestock. Local ordinances let every community write its own fine print — as long as it doesn't break the bigger rules.",
  coverageTitle: "Current coverage: LOCUS-v1",
  coverageBody:
    "The catch: these laws are public, but they're scattered across thousands of clunky vendor sites. LOCUS rounded up ~2.2 million of them into a single local-law corpus. That dataset is the starting point for Visualize Laws; state and federal laws are not included yet.",
  cta: "Explore 2.2M laws →",
  roadmapTitle: "Where the map goes next",
  roadmapBody:
    "The long-term goal is to make local, state, and federal law explorable through the same visual system. Planned coverage begins with financial regulation: securities laws, money-transmission laws, the Investment Company Act and related regulation, banking law, and adjacent areas of financial services.",
  roadmapWhy:
    "Starting there supports research and infrastructure for financial products and tokenized securities, where understanding how overlapping rules differ across jurisdictions is especially useful.",
  roadmapNote:
    "This is the roadmap, not current coverage. Today's searchable corpus remains LOCUS-v1 local ordinances.",
  cite: "Built on LOCUS-v1",
  paper: "Paper ↗",
  dataset: "Models & Dataset ↗",
  covers: COVERS,
};

const FUNNY_COPY = {
  back: "← return to the legal panic",
  kicker: "WHAT IS THIS",
  title: "The fine print has a map now",
  lede:
    "America wrote millions of local laws and scattered them across the internet like a bureaucratic treasure hunt. Visualize Laws puts them on a map, makes them searchable, and scores their HUH? Factor, Wiggle Room, Nanny Index, and whether the problem Actually Matters.",
  layersTitle: "Three levels of government walked into a database",
  layersBody:
    "Federal law covers the country, state law covers a state, and local law covers the place arguing about your fence. We started at the bottom of the stack because LOCUS-v1 assembled an unusually broad, structured corpus of city and county ordinances.",
  federal: "FEDERAL",
  federalMeta: "Congress · nationwide main quest",
  state: "STATE",
  stateMeta: "state legislature · fifty side quests",
  local: "LOCAL ← CHAOS CURRENTLY MAPPED",
  localMeta: "city / county council · extremely specific concerns",
  layersNote:
    "A local ordinance is a city or county law that applies inside that jurisdiction. It governs zoning, licenses, noise, parking, chickens, fences, and other matters that were apparently too important to leave to chance. State and federal law still outrank it.",
  governsTitle: "Tiny rules, enormous opinions",
  governsBody: "Local codes answer the questions nobody asked until two neighbors got involved:",
  whyTitle: "Why are there so many of these?",
  whyBody:
    "A dense city, a beach town, and a rural county do not want the same rulebook. Local ordinances let each community customize the fine print for its own rentals, livestock, parking, noise, and recurring civic arguments — without overruling state or federal law.",
  coverageTitle: "Current rabbit hole: LOCUS-v1",
  coverageBody:
    "The laws were public; finding them was the sport. LOCUS collected roughly 2.2 million local laws from thousands of scattered sources into one corpus. That is what you can search today. State and federal laws have not entered the arena yet.",
  cta: "Enter the ordinance mines →",
  roadmapTitle: "Next up: follow the money",
  roadmapBody:
    "The long-term plan is one visual system for local, state, and federal law. The first planned expansion is financial regulation: securities laws, money-transmission laws, the Investment Company Act and related regulation, banking law, and adjacent financial-services rules.",
  roadmapWhy:
    "That priority supports research and infrastructure for financial products and tokenized securities, where overlapping jurisdictional rules are less a fun surprise and more an engineering requirement.",
  roadmapNote:
    "Roadmap, not magic trick: the searchable corpus today is still LOCUS-v1 local ordinances.",
  cite: "Receipts: LOCUS-v1",
  paper: "The paper ↗",
  dataset: "The dataset ↗",
  covers: FUNNY_COVERS,
};

export default function AboutPage() {
  const { state } = useExplorer();
  const copy = state.unhinged ? FUNNY_COPY : NORMAL_COPY;

  return (
    <Page>
      <Inner variants={container} initial="hidden" animate="show">
        <TopRow>
          <MonoLink as={Link} href="/">
            {copy.back}
          </MonoLink>
          <Kicker>{copy.kicker}</Kicker>
        </TopRow>

        <Section variants={item}>
          <H1 as="h1">{copy.title}</H1>
          <Lede>{copy.lede}</Lede>
        </Section>

        <Section variants={item}>
          <H2>{copy.layersTitle}</H2>
          <Body>{copy.layersBody}</Body>
          <Note as="div" style={{ marginTop: 16 }}>
            <Stack $gap={2}>
              <Tier>
                <TierName>{copy.federal}</TierName>
                <TierMeta>{copy.federalMeta}</TierMeta>
              </Tier>
              <Tier>
                <TierName>{copy.state}</TierName>
                <TierMeta>{copy.stateMeta}</TierMeta>
              </Tier>
              <Tier $active>
                <TierName>{copy.local}</TierName>
                <TierMeta $active>{copy.localMeta}</TierMeta>
              </Tier>
            </Stack>
          </Note>
          <Note>{copy.layersNote}</Note>
        </Section>

        <Section variants={item}>
          <H2>{copy.governsTitle}</H2>
          <Body>{copy.governsBody}</Body>
          <CoverList style={{ marginTop: 16 }}>
            {copy.covers.map(([term, quip]) => (
              <CoverItem key={term}>
                <b>{term}</b>
                <span>{quip}</span>
              </CoverItem>
            ))}
          </CoverList>
        </Section>

        <Section variants={item}>
          <H2>{copy.whyTitle}</H2>
          <Body>{copy.whyBody}</Body>
        </Section>

        <Section variants={item}>
          <H2>{copy.coverageTitle}</H2>
          <Body>{copy.coverageBody}</Body>
          <Cta href="/" $variant="primary" $pill>
            {copy.cta}
          </Cta>
        </Section>

        <Section variants={item}>
          <H2>{copy.roadmapTitle}</H2>
          <Body>{copy.roadmapBody}</Body>
          <Body>{copy.roadmapWhy}</Body>
          <Note>{copy.roadmapNote}</Note>
        </Section>

        <Section variants={item}>
          <CiteLabel>{copy.cite}</CiteLabel>
          <Cite>{BIBTEX}</Cite>
          <Links $gap={3}>
            <LinkButton
              href={PAPER_URL}
              target="_blank"
              rel="noreferrer"
              $variant="ghost"
              $pill
              $size="sm"
            >
              {copy.paper}
            </LinkButton>
            <LinkButton
              href={DATASET_URL}
              target="_blank"
              rel="noreferrer"
              $variant="ghost"
              $pill
              $size="sm"
            >
              {copy.dataset}
            </LinkButton>
          </Links>
        </Section>
      </Inner>
      <Footer />
    </Page>
  );
}
