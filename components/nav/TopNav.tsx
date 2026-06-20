"use client";

// STUB (owned by agent-ui). Renders the title + an axis selector wired to the
// store so the foundation is interactive. Replace with the animated version.
import styled from "styled-components";
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
`;

const Axes = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space(1)};
`;

const AxisButton = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.fg : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g64)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.fg : theme.colors.g20)};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  font-size: ${({ theme }) => theme.fontSize.sm};
  cursor: pointer;
  transition: all 0.18s ease;
`;

const AboutLink = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.colors.g64};
  border: 0;
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function TopNav() {
  const { state, dispatch } = useExplorer();
  return (
    <Bar>
      <Brand>LOCUS&nbsp;EXPLORER</Brand>
      <Axes>
        {AXES.map((a) => (
          <AxisButton
            key={a.key}
            $active={state.axis === a.key}
            onClick={() => dispatch({ type: "setAxis", axis: a.key })}
          >
            {a.label}
          </AxisButton>
        ))}
      </Axes>
      <AboutLink onClick={() => dispatch({ type: "setAbout", open: true })}>About</AboutLink>
    </Bar>
  );
}
