"use client";

// Top navigation: brand, the axis selector (with a framer-motion shared-layout
// active indicator), and the About trigger.
import styled from "styled-components";
import Link from "next/link";
import { useExplorer } from "@/lib/store";
import { AXES, type Axis } from "@/lib/types";
import { theme } from "@/lib/theme";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { Mono, MonoLink } from "@/components/ui/text";
import { PillHighlight } from "@/components/ui/forms";

const AXIS_ACCENT: Record<Axis, string> = theme.colors.axis;

const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(5)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g12};
  z-index: ${({ theme }) => theme.z.nav};
`;

const Brand = styled(Mono)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
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

const RightNav = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space(3)};
  flex-shrink: 0;
`;

const ChaosButton = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? "#E53E3E" : "transparent")};
  border: 1px solid
    ${({ $active, theme }) => ($active ? "#E53E3E" : theme.colors.g12)};
  color: ${({ $active }) => ($active ? "#000" : "rgba(255,255,255,0.76)")};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(2.5)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.08em;
  cursor: pointer;
  white-space: nowrap;
  transition: ${({ theme }) => theme.transitions.default};

  &:hover {
    border-color: ${({ $active }) => ($active ? "#E53E3E" : "rgba(255,255,255,0.42)")};
  }
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

export function TopNav() {
  const { state, dispatch } = useExplorer();
  const { unhinged } = state;
  return (
    <Bar>
      <Brand>{unhinged ? "VISUALIZE LAWS \uD83D\uDD25" : "VISUALIZE LAWS"}</Brand>
      <Axes>
        {AXES.map((a) => {
          const active = state.axis === a.key;
          const copy = resolveAxisCopy(a.key, unhinged);
          return (
            <AxisButton
              key={a.key}
              $active={active}
              onClick={() => dispatch({ type: "setAxis", axis: a.key })}
              title={copy.blurb}
            >
              {active && (
                <PillHighlight
                  layoutId="axis-active"
                  $bg={AXIS_ACCENT[a.key]}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              {copy.label}
            </AxisButton>
          );
        })}
      </Axes>
      <RightNav>
        <ChaosButton
          type="button"
          $active={unhinged}
          onClick={() => dispatch({ type: "toggleUnhinged" })}
          title="Toggle unhinged mode"
        >
          CHAOS
        </ChaosButton>
        <MonoLink as={Link} href="/about">
          {ui("About", unhinged)}
        </MonoLink>
      </RightNav>
    </Bar>
  );
}
