"use client";

// Top navigation: brand, the axis selector (with a framer-motion shared-layout
// active indicator), and the About trigger.
import styled from "styled-components";
import Link from "next/link";
import { motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import { AXES } from "@/lib/types";

const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(5)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g12};
  z-index: ${({ theme }) => theme.z.nav};
`;

const Brand = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: ${({ theme }) => theme.fontSize.lg};
  white-space: nowrap;
`;

const Axes = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space(1)};
  padding: 3px;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow-x: auto;
  max-width: 100%;
`;

const AxisButton = styled.button<{ $active: boolean }>`
  position: relative;
  background: transparent;
  border: 0;
  z-index: 1;
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g64)};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  font-size: ${({ theme }) => theme.fontSize.sm};
  white-space: nowrap;
  cursor: pointer;
  transition: color ${({ theme }) => theme.motion.fast}s ease;

  &:hover {
    color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.fg)};
  }
`;

const ActivePill = styled(motion.span)`
  position: absolute;
  inset: 0;
  z-index: -1;
  background: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.pill};
`;

const AboutLink = styled(Link)`
  background: transparent;
  color: ${({ theme }) => theme.colors.g64};
  border: 0;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  white-space: nowrap;
  transition: color ${({ theme }) => theme.motion.fast}s ease;
  &:hover {
    color: ${({ theme }) => theme.colors.fg};
  }
`;

export function TopNav() {
  const { state, dispatch } = useExplorer();
  return (
    <Bar>
      <Brand>LOCUS&nbsp;EXPLORER</Brand>
      <Axes>
        {AXES.map((a) => {
          const active = state.axis === a.key;
          return (
            <AxisButton
              key={a.key}
              $active={active}
              onClick={() => dispatch({ type: "setAxis", axis: a.key })}
              title={a.blurb}
            >
              {active && (
                <ActivePill
                  layoutId="axis-active"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              {a.label}
            </AxisButton>
          );
        })}
      </Axes>
      <AboutLink href="/about">About</AboutLink>
    </Bar>
  );
}
