"use client";

// /about — a quick, slightly cheeky primer on what a local ordinance actually
// is, plus the LOCUS-v1 attribution. Reached from the nav "About" link.
import Link from "next/link";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer/Footer";
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  BIBTEX,
  DATASET_URL,
  PAPER_URL,
  TWEET_URL,
} from "@/lib/attribution";

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

const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space(8)};
`;

const Back = styled(Link)`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.g64};
  transition: color ${({ theme }) => theme.motion.fast}s ease;
  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;

const Kicker = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.18em;
  color: ${({ theme }) => theme.colors.g48};
`;

const Section = styled(motion.section)`
  margin-top: ${({ theme }) => theme.space(10)};
`;

const H1 = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSize.xxl};
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-weight: 700;
`;

const Lede = styled.p`
  margin: ${({ theme }) => theme.space(5)} 0 0;
  font-size: ${({ theme }) => theme.fontSize.lg};
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.g80};
`;

const H2 = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space(4)};
  font-size: ${({ theme }) => theme.fontSize.xl};
  font-weight: 600;
`;

const Body = styled.p`
  margin: ${({ theme }) => theme.space(3)} 0 0;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.g80};
`;

const Tiers = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(2)};
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

const Note = styled.p`
  margin: ${({ theme }) => theme.space(4)} 0 0;
  line-height: 1.6;
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

  @media (max-width: 560px) {
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

const Cta = styled(Link)`
  display: inline-block;
  margin-top: ${({ theme }) => theme.space(5)};
  padding: ${({ theme }) => theme.space(2.5)} ${({ theme }) => theme.space(5)};
  background: ${({ theme }) => theme.colors.fg};
  color: ${({ theme }) => theme.colors.bg};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-weight: 600;
  font-size: ${({ theme }) => theme.fontSize.sm};
  transition: opacity ${({ theme }) => theme.motion.fast}s ease;
  &:hover {
    opacity: 0.85;
  }
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
  margin-top: ${({ theme }) => theme.space(4)};
`;

const LinkButton = styled.a`
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.fg};
  transition: border-color ${({ theme }) => theme.motion.fast}s ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.g48};
  }
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
          <Back href="/">&larr; back to the map</Back>
          <Kicker>ABOUT</Kicker>
        </TopRow>

        <Section variants={item}>
          <H1>So what is a local ordinance?</H1>
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
            <Tiers>
              <Tier>
                <TierName>FEDERAL</TierName>
                <TierMeta>U.S. Congress &middot; the whole country</TierMeta>
              </Tier>
              <Tier>
                <TierName>STATE</TierName>
                <TierMeta>state legislature &middot; one entire state</TierMeta>
              </Tier>
              <Tier $active>
                <TierName>LOCAL &larr; you are here</TierName>
                <TierMeta $active>city / county council &middot; your town</TierMeta>
              </Tier>
            </Tiers>
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
            them into a single corpus, and LOCUS Explorer lets you actually search and
            map them &mdash; each scored along four axes: opacity, enforcement
            discretion, paternalism, and problem salience.
          </Body>
          <Cta href="/">Explore 2.2M laws &rarr;</Cta>
        </Section>

        <Section variants={item}>
          <CiteLabel>Built on LOCUS-v1 &middot; please cite</CiteLabel>
          <Cite>{BIBTEX}</Cite>
          <Links>
            <LinkButton href={PAPER_URL} target="_blank" rel="noreferrer">
              Paper &nearr;
            </LinkButton>
            <LinkButton href={DATASET_URL} target="_blank" rel="noreferrer">
              Models &amp; Dataset &nearr;
            </LinkButton>
            <LinkButton href={TWEET_URL} target="_blank" rel="noreferrer">
              Announcement &nearr;
            </LinkButton>
            <LinkButton href={AUTHOR_URL} target="_blank" rel="noreferrer">
              {AUTHOR_NAME} &nearr;
            </LinkButton>
          </Links>
        </Section>
      </Inner>
      <Footer />
    </Page>
  );
}
