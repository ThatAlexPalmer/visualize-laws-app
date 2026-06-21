"use client";

// /about — a quick, slightly cheeky primer on what a local ordinance actually
// is, plus the LOCUS-v1 attribution. Reached from the nav "About" link.
import Link from "next/link";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer/Footer";
import {
  APP_AUTHOR,
  APP_AUTHOR_URL,
  AUTHOR_NAME,
  AUTHOR_URL,
  BIBTEX,
  DATASET_URL,
  PAPER_URL,
  TWEET_URL,
} from "@/lib/attribution";
import { ButtonLink } from "@/components/ui/buttons";
import { Cluster, Row, SectionLabel, Stack } from "@/components/ui/containers";
import { Heading, Kicker as UiKicker, MonoLink, Muted } from "@/components/ui/text";

const Page = styled.div`
  height: 100vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bg};
`;

const Inner = styled(motion.main)`
  max-width: 760px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space(8)} ${({ theme }) => theme.space(5)}
    ${({ theme }) => theme.space(16)};
`;

const TopRow = styled(Row)`
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space(8)};
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
  border-radius: ${({ theme }) => theme.radius.md};
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
  color: ${({ theme, $active }) => ($active ? theme.colors.bg : theme.colors.g48)};
  text-align: right;
`;

const Note = styled(Muted)`
  margin: ${({ theme }) => theme.space(4)} 0 0;
  color: ${({ theme }) => theme.colors.g64};
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
    color: ${({ theme }) => theme.colors.g64};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space(1)};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSize.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => theme.space(2)} ${({ theme }) => theme.space(3)};
    border: 1px solid ${({ theme }) => theme.colors.g12};
    vertical-align: top;
  }
  th {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: ${({ theme }) => theme.fontSize.xs};
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.g64};
  }
  td b {
    font-weight: 600;
  }
  td span {
    color: ${({ theme }) => theme.colors.g64};
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
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => theme.space(3)};
  color: ${({ theme }) => theme.colors.g80};
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

export default function AboutPage() {
  return (
    <Page>
      <Inner variants={container} initial="hidden" animate="show">
        <TopRow>
          <MonoLink as={Link} href="/">
            ← back to the map
          </MonoLink>
          <Kicker>ABOUT</Kicker>
        </TopRow>

        <Section variants={item}>
          <H1 as="h1">So what is a local ordinance?</H1>
          <Lede>
            Short version: it&rsquo;s a law your city or county made up, and it only
            applies inside those lines on the map. Not federal. Not state. It&rsquo;s
            the hyper-local fine print that decides whether your backyard chickens,
            your fence height, and your 11&nbsp;p.m. garage band are technically legal.
          </Lede>
        </Section>

        <Section variants={item}>
          <H2>The legal pecking order</H2>
          <Body>U.S. law is a stack, and local ordinances sit at the very bottom:</Body>
          <Note as="div" style={{ marginTop: 16 }}>
            <Stack $gap={2}>
              <Tier>
                <TierName>FEDERAL</TierName>
                <TierMeta>U.S. Congress &middot; the whole country</TierMeta>
              </Tier>
              <Tier>
                <TierName>STATE</TierName>
                <TierMeta>state legislature &middot; one entire state</TierMeta>
              </Tier>
              <Tier $active>
                <TierName>LOCAL ← you are here</TierName>
                <TierMeta $active>city / county council &middot; your town</TierMeta>
              </Tier>
            </Stack>
          </Note>
          <Note>
            Local rules can&rsquo;t pick a fight with the bigger ones. If an ordinance
            conflicts with state or federal law, the higher law wins &mdash; lawyers
            call it <em>preemption</em>; everyone else calls it &ldquo;nice try.&rdquo;
            Cities only get the powers their state hands down.
          </Note>
        </Section>

        <Section variants={item}>
          <H2>What they actually govern</H2>
          <Body>Dull name, surprisingly personal reach. Local codes usually cover:</Body>
          <CoverList style={{ marginTop: 16 }}>
            {COVERS.map(([term, quip]) => (
              <CoverItem key={term}>
                <b>{term}</b>
                <span>{quip}</span>
              </CoverItem>
            ))}
          </CoverList>
        </Section>

        <Section variants={item}>
          <H2>Federal vs. state vs. local</H2>
          <Table>
            <thead>
              <tr>
                <th>Level</th>
                <th>Who writes them</th>
                <th>Where they apply</th>
                <th>Classic examples</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Federal</b></td>
                <td><span>U.S. Congress</span></td>
                <td><span>the whole country</span></td>
                <td><span>immigration, interstate commerce</span></td>
              </tr>
              <tr>
                <td><b>State</b></td>
                <td><span>state legislature</span></td>
                <td><span>one entire state</span></td>
                <td><span>driver&rsquo;s licenses, criminal code</span></td>
              </tr>
              <tr>
                <td><b>Local</b></td>
                <td><span>city / county council</span></td>
                <td><span>one city or county</span></td>
                <td><span>zoning, noise, parking</span></td>
              </tr>
            </tbody>
          </Table>
          <Note>None of them may conflict downward: local can&rsquo;t override state, and state can&rsquo;t override federal.</Note>
        </Section>

        <Section variants={item}>
          <H2>Why bother with them at all?</H2>
          <Body>
            Because a dense city and a rural town want wildly different things. One
            needs rules for short-term rentals and 2&nbsp;a.m. noise; the other cares
            about ATVs and livestock. Local ordinances let every community write its
            own fine print &mdash; as long as it doesn&rsquo;t break the bigger rules.
          </Body>
        </Section>

        <Section variants={item}>
          <H2>Where LOCUS comes in</H2>
          <Body>
            The catch: these laws are public, but they&rsquo;re scattered across
            thousands of clunky vendor sites. LOCUS rounded up ~2.2&nbsp;million of
            them into a single corpus, and visualizelaws.app lets you actually search and
            map them &mdash; each scored along four axes: opacity, enforcement
            discretion, paternalism, and problem salience.
          </Body>
          <Cta href="/" $variant="primary" $pill>
            Explore 2.2M laws →
          </Cta>
        </Section>

        <Section variants={item}>
          <CiteLabel>Built on LOCUS-v1 &middot; please cite</CiteLabel>
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
              Paper ↗
            </LinkButton>
            <LinkButton
              href={DATASET_URL}
              target="_blank"
              rel="noreferrer"
              $variant="ghost"
              $pill
              $size="sm"
            >
              Models &amp; Dataset ↗
            </LinkButton>
            <LinkButton
              href={TWEET_URL}
              target="_blank"
              rel="noreferrer"
              $variant="ghost"
              $pill
              $size="sm"
            >
              Announcement ↗
            </LinkButton>
            <LinkButton
              href={AUTHOR_URL}
              target="_blank"
              rel="noreferrer"
              $variant="ghost"
              $pill
              $size="sm"
            >
              {AUTHOR_NAME} ↗
            </LinkButton>
          </Links>
          <Note>
            App by{" "}
            <MonoLink href={APP_AUTHOR_URL} target="_blank" rel="noreferrer" $size="sm">
              {APP_AUTHOR} ↗
            </MonoLink>{" "}
            &mdash; an independent project, separate from the LOCUS-v1 dataset &amp;
            research credited above.
          </Note>
        </Section>
      </Inner>
      <Footer />
    </Page>
  );
}
