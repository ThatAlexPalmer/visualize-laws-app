"use client";

// Top navigation: brand, the axis selector (with a framer-motion shared-layout
// active indicator), and the About trigger.
import styled from "styled-components";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useExplorer } from "@/lib/store";
import { AXES, type Axis } from "@/lib/types";
import { theme } from "@/lib/theme";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { Mono, MonoLink } from "@/components/ui/text";
import { PillHighlight } from "@/components/ui/forms";
import { REPOSITORY_URL } from "@/lib/attribution";

const AXIS_ACCENT: Record<Axis, string> = theme.colors.axis;

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

const Axes = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space(1)};
  padding: 3px;
  border: 1px solid ${({ theme }) => theme.colors.g12};
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow-x: auto;
  max-width: 100%;
  width: max-content;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

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

const Scrim = styled.button<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 0;
    z-index: -1;
    border: 0;
    background: rgba(0, 0, 0, 0.72);
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transition: opacity 160ms ease;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

const MobileSheet = styled.div<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 auto;
    z-index: 0;
    max-height: calc(100dvh - 59px);
    overflow-y: auto;
    padding: ${({ theme }) => theme.space(4)} ${({ theme }) => theme.space(3)}
      ${({ theme }) => theme.space(5)};
    border-bottom: 1px solid ${({ theme }) => theme.colors.g20};
    background: ${({ theme }) => theme.colors.bg};
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transform: translate3d(0, ${({ $open }) => ($open ? "0" : "-10px")}, 0);
    will-change: ${({ $open }) => ($open ? "transform, opacity" : "auto")};
    transition:
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 140ms ease,
      visibility 0s linear ${({ $open }) => ($open ? "0s" : "180ms")};

    @media (prefers-reduced-motion: reduce) {
      transform: none;
      transition: none;
    }
  }
`;

const SheetInner = styled.div`
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
`;

const SheetLabel = styled(Mono)`
  margin-bottom: ${({ theme }) => theme.space(2)};
  color: ${({ theme }) => theme.colors.g60};
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
`;

const SheetAxes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 52px;
  gap: ${({ theme }) => theme.space(1.5)};
`;

const SheetAxis = styled.button<{ $active: boolean; $accent: string }>`
  width: 100%;
  height: 52px;
  padding: ${({ theme }) => theme.space(3)};
  border: 1px solid ${({ $active, $accent, theme }) => ($active ? $accent : theme.colors.g12)};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $active, $accent }) => ($active ? $accent : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g90)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
`;

const SheetActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 52px;
  gap: ${({ theme }) => theme.space(2)};
  margin-top: ${({ theme }) => theme.space(4)};
  padding-top: ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g12};
`;

const SheetAction = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 52px;
  padding: 0 ${({ theme }) => theme.space(3)};
  border: 1px solid ${({ $active, theme }) => ($active ? "#E53E3E" : theme.colors.g12)};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $active }) => ($active ? "#E53E3E" : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.fg)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-decoration: none;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
`;

const AxisButton = styled.button<{ $active: boolean }>`
  position: relative;
  background: transparent;
  border: 0;
  z-index: 1;
  color: ${({ $active, theme }) => ($active ? theme.colors.bg : theme.colors.g76)};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  min-height: 32px;
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

  const navigateFromMenu = (href: string) => {
    setMenuOpen(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => router.push(href), 160);
  };

  return (
    <Bar>
      <Brand as={Link} href="/" style={{ color: "inherit", textDecoration: "none" }}>
        <BrandMark src="/favicon.svg" alt="" aria-hidden="true" />
        <BrandText>{unhinged ? "VISUALIZE LAWS \uD83D\uDD25" : "VISUALIZE LAWS"}</BrandText>
      </Brand>
      <Axes>
        {AXES.map((a) => {
          const active = state.axis === a.key;
          const copy = resolveAxisCopy(a.key, unhinged);
          return (
            <AxisButton
              key={a.key}
              $active={active}
              onClick={() => selectAxis(a.key)}
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
      <Scrim
        $open={menuOpen}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />
      <MobileSheet id="mobile-navigation" $open={menuOpen} aria-hidden={!menuOpen} inert={!menuOpen ? true : undefined}>
        <SheetInner>
          <SheetLabel>Choose what the map shows</SheetLabel>
          <SheetAxes>
            {AXES.map((axis) => {
              const copy = resolveAxisCopy(axis.key, unhinged);
              return (
                <SheetAxis
                  key={axis.key}
                  $active={state.axis === axis.key}
                  $accent={AXIS_ACCENT[axis.key]}
                  onClick={() => selectAxis(axis.key)}
                >
                  {copy.label}
                </SheetAxis>
              );
            })}
          </SheetAxes>
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
        </SheetInner>
      </MobileSheet>
    </Bar>
  );
}
