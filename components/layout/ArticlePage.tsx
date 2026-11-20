"use client";

// Shared shell for /about and /log. The two pages differ in two places:
// /about centers the back-link row (the app's usual Row) and gives the title
// the same 40px gap as the sections under it; /log aligns that row to the
// text baseline and starts the title flush.
import type { ReactNode } from "react";
import Link from "next/link";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer/Footer";
import { Row } from "@/components/ui/containers";
import { Heading, Kicker as UiKicker, MonoLink, Muted } from "@/components/ui/text";

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

const CenterTopRow = styled(Row)`
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space(8)};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    display: none;
  }
`;

const BaselineTopRow = styled.div`
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

const Title = styled(Heading)`
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

const TitleBlock = styled(motion.section)<{ $gap: boolean }>`
  margin-top: ${({ $gap, theme }) => ($gap ? theme.space(10) : "0")};
`;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const articleItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function ArticlePage({
  back,
  kicker,
  title,
  lede,
  align,
  titleGap,
  children,
}: {
  back: string;
  kicker: string;
  title: string;
  lede: string;
  align: "center" | "baseline";
  titleGap: boolean;
  children: ReactNode;
}) {
  const TopRow = align === "baseline" ? BaselineTopRow : CenterTopRow;
  return (
    <Page>
      <Inner variants={container} initial="hidden" animate="show">
        <TopRow>
          <MonoLink as={Link} href="/">
            {back}
          </MonoLink>
          <Kicker>{kicker}</Kicker>
        </TopRow>
        <TitleBlock variants={articleItem} $gap={titleGap}>
          <Title as="h1">{title}</Title>
          <Lede>{lede}</Lede>
        </TitleBlock>
        {children}
      </Inner>
      <Footer />
    </Page>
  );
}
