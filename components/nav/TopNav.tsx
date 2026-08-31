"use client";

// Top navigation: brand, the axis selector (with a framer-motion shared-layout
// active indicator), and the About trigger.
import styled from "styled-components";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useExplorer } from "@/lib/store";
import type { Axis } from "@/lib/types";
import { ui } from "@/lib/copy";
import { Mono, MonoLink } from "@/components/ui/text";
import { REPOSITORY_URL } from "@/lib/attribution";
import {
  LayerPicker,
  NavSheet,
  SheetAction,
  SheetActions,
} from "@/components/nav/LayerPicker";

const Bar = styled.header`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(5)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g12};
  z-index: ${({ theme }) => theme.z.nav};

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: flex;
    justify-content: space-between;
    height: 59px;
    padding: ${({ theme }) => theme.space(2.5)} ${({ theme }) => theme.space(3)};
  }
`;

const Brand = styled(Mono)`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space(2)};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.04em;
  font-size: ${({ theme }) => theme.fontSize.lg};
  white-space: nowrap;
  min-width: 0;
  justify-self: start;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    font-size: ${({ theme }) => theme.fontSize.md};
    letter-spacing: 0.02em;
  }
`;

const BrandMark = styled.img`
  width: 24px;
  height: 24px;
  display: block;
  flex: 0 0 24px;
`;

const BrandText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: none;
  }
`;

const RightNav = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space(3)};
  flex-shrink: 0;
  justify-self: end;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: none;
  }
`;

const FunnyButton = styled.button<{ $active: boolean }>`
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

const FiltersButton = styled(FunnyButton)`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: inline-flex;
    align-items: center;
  }
`;

const MenuButton = styled.button`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.fg};
    cursor: pointer;
    transition: color 140ms ease;

    &:hover {
      color: ${({ theme }) => theme.colors.g76};
    }

    &:focus-visible {
      outline: 1px solid ${({ theme }) => theme.colors.g60};
      outline-offset: 2px;
    }
  }
`;

const MenuGlyph = styled.span`
  position: relative;
  width: 18px;
  height: 10px;

  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 0;
    width: 18px;
    height: 1px;
    background: currentColor;
    transition: transform 180ms ease, top 180ms ease;
  }

  &::before { top: 1px; }
  &::after { top: 9px; }

  ${MenuButton}[aria-expanded="true"] &::before {
    top: 5px;
    transform: rotate(45deg);
  }
  ${MenuButton}[aria-expanded="true"] &::after {
    top: 5px;
    transform: rotate(-45deg);
  }
`;

export function TopNav() {
  const { state, dispatch } = useExplorer();
  const { unhinged } = state;
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelOpen = menuOpen || state.filtersOpen;
  const aboutLabel = ui("About", unhinged);

  useEffect(() => {
    return () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    dispatch({ type: "closeFilters" });
  }, [pathname, dispatch]);
  useEffect(() => {
    if (state.filtersOpen) setMenuOpen(false);
  }, [state.filtersOpen]);
  useEffect(() => {
    if (!panelOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      dispatch({ type: "closeFilters" });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panelOpen, dispatch]);

  const selectAxis = (axis: Axis) => {
    dispatch({ type: "setAxis", axis });
    setMenuOpen(false);
    if (pathname !== "/") {
      navigationTimer.current = setTimeout(() => router.push("/"), 160);
    }
  };

  const selectPenalties = () => {
    dispatch({ type: "setLayer", layer: "penalties" });
    setMenuOpen(false);
    if (pathname !== "/") {
      navigationTimer.current = setTimeout(() => router.push("/"), 160);
    }
  };

  const navigateFromMenu = (href: string) => {
    setMenuOpen(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => router.push(href), 160);
  };

  const picker = {
    axis: state.axis,
    layer: state.layer,
    unhinged,
    selectAxis,
    selectPenalties,
  };

  return (
    <Bar>
      <Brand as={Link} href="/" style={{ color: "inherit", textDecoration: "none" }}>
        <BrandMark src="/favicon.svg" alt="" aria-hidden="true" />
        <BrandText>{unhinged ? "VISUALIZE LAWS \uD83D\uDD25" : "VISUALIZE LAWS"}</BrandText>
      </Brand>
      <LayerPicker layout="pills" {...picker} />
      <RightNav>
        <FiltersButton
          type="button"
          $active={state.filtersOpen}
          onClick={() => dispatch({ type: "toggleFilters" })}
          aria-expanded={state.filtersOpen}
          aria-controls="filters-panel"
        >
          FILTERS
        </FiltersButton>
        <FunnyButton
          type="button"
          $active={unhinged}
          onClick={() => dispatch({ type: "toggleUnhinged" })}
          title="Toggle funny mode"
        >
          FUNNY
        </FunnyButton>
        <MonoLink as={Link} href="/about">
          {aboutLabel}
        </MonoLink>
      </RightNav>
      <MenuButton
        type="button"
        aria-expanded={panelOpen}
        aria-controls={state.filtersOpen ? "filters-panel" : "mobile-navigation"}
        aria-label={panelOpen ? "Close navigation" : "Open navigation"}
        onClick={() => {
          if (state.filtersOpen) {
            dispatch({ type: "closeFilters" });
            return;
          }
          setMenuOpen((open) => !open);
        }}
      >
        <MenuGlyph aria-hidden="true" />
      </MenuButton>
      <NavSheet open={menuOpen} onClose={() => setMenuOpen(false)} {...picker}>
        <SheetActions>
          {pathname === "/" ? (
            <SheetAction
              onClick={() => {
                setMenuOpen(false);
                dispatch({ type: "toggleFilters" });
              }}
            >
              FILTERS
            </SheetAction>
          ) : (
            <SheetAction
              as={Link}
              href="/"
              onClick={(event) => {
                event.preventDefault();
                navigateFromMenu("/");
              }}
            >
              MAP
            </SheetAction>
          )}
          <SheetAction $active={unhinged} onClick={() => dispatch({ type: "toggleUnhinged" })}>
            FUNNY · {unhinged ? "ON" : "OFF"}
          </SheetAction>
          <SheetAction
            as={Link}
            href="/about"
            aria-current={pathname === "/about" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateFromMenu("/about");
            }}
          >
            {aboutLabel}
          </SheetAction>
          <SheetAction
            as={Link}
            href="/log"
            aria-current={pathname === "/log" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateFromMenu("/log");
            }}
          >
            {ui("log", unhinged)}
          </SheetAction>
          <SheetAction
            as="a"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository (opens in a new tab)"
            onClick={() => setMenuOpen(false)}
          >
            GITHUB
          </SheetAction>
        </SheetActions>
      </NavSheet>
    </Bar>
  );
}
