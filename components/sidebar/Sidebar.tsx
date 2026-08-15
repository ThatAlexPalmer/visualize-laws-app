"use client";

// Advanced filter rail. All controls are wired to the store's `filters`; text
// and slider inputs are debounced (~300ms) before dispatching to avoid query spam.
import { useEffect, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  DEFAULT_SCORE_RANGE,
  FUNCTIONS,
  STATE_NAMES,
  TOPICS,
  prettySlug,
  type Axis,
  type ScoreRange,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import { useJurisdictions } from "@/components/jurisdiction/JurisdictionsProvider";
import { RangeSlider } from "./RangeSlider";
import { Button } from "@/components/ui/buttons";
import {
  Field,
  FieldLabel,
  Input,
  PillHighlight,
  SegItem,
  Segmented,
  Select,
} from "@/components/ui/forms";
import {
  Panel as PanelBase,
  Row,
  ScrollArea,
  SectionLabel,
  Stack,
} from "@/components/ui/containers";

const STATE_ENTRIES = Object.entries(STATE_NAMES).sort((a, b) =>
  a[1].localeCompare(b[1]),
);

const SUBSTANTIVE_OPTS: { label: string; value: boolean | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Substantive", value: true },
  { label: "Procedural", value: false },
];

const MobileAside = styled(motion.aside)<{ $open: boolean }>`
  position: fixed;
  inset: 59px 0 auto;
  width: 100%;
  max-height: calc(100dvh - 59px);
  padding: ${({ theme }) => theme.space(4)};
  padding-left: max(${({ theme }) => theme.space(4)}, calc((100vw - 640px) / 2));
  padding-right: max(${({ theme }) => theme.space(4)}, calc((100vw - 640px) / 2));
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.bg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g20};
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
  z-index: 92;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(5)};
  visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
  pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
  transform: translate3d(0, ${({ $open }) => ($open ? "0" : "-100%")}, 0);
  will-change: transform;
  transition:
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear ${({ $open }) => ($open ? "0s" : "240ms")};
`;

const DesktopPanel = styled(PanelBase)`
  min-height: 0;
  height: 100%;
  align-self: stretch;
`;

const DesktopScroll = styled(ScrollArea)`
  /* The form fills the remaining viewport band. At ordinary desktop heights
     every control is visible; short windows gain an internal scrollbar instead
     of pushing the pager and footer below the viewport. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(3)};
  padding: ${({ theme }) => theme.space(3)};

  /* The desktop column is intentionally denser than the touch drawer. This
     keeps every control visible in the shared 640px workspace without
     shrinking tap targets on compact layouts. */
  ${Field} {
    gap: ${({ theme }) => theme.space(1.5)};
  }

  ${Stack} {
    gap: ${({ theme }) => theme.space(2.5)};
  }

  ${Input},
  ${Select} {
    padding: 8px 10px;
  }

  ${Segmented} {
    padding: 2px;
  }

  ${SegItem} {
    padding: ${({ theme }) => theme.space(1)} 0;
  }
`;

const Backdrop = styled.button<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 0;
    z-index: 91;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.72);
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transition:
      opacity ${({ theme }) => theme.motion.fast}s ease,
      visibility ${({ $open }) => ($open ? "0s" : "0s 0.18s")};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space(2)};
`;

// The Reset control reuses the Button primitive (ghost variant); it only dims
// the resting label to g64 and keeps a subtle press affordance.
const ResetButton = styled(Button)`
  color: ${({ theme }) => theme.colors.g76};

  &:active {
    transform: scale(0.94);
  }
`;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};
const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0 },
};

function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isCompact;
}

function makeFullRanges(domainFor: (a: Axis) => ScoreRange) {
  return Object.fromEntries(
    AXES.map((a) => [a.key, domainFor(a.key)]),
  ) as Record<Axis, ScoreRange>;
}

function FilterControls({ idPrefix }: { idPrefix: string }) {
  const { state, dispatch } = useExplorer();
  const { data } = useJurisdictions();
  const { filters, unhinged } = state;
  const bounds = data?.national?.bounds ?? null;

  const [city, setCity] = useState(filters.city ?? "");
  const [county, setCounty] = useState(filters.county ?? "");
  const [ranges, setRanges] = useState<Record<Axis, ScoreRange>>(() =>
    makeFullRanges(() => ({ ...DEFAULT_SCORE_RANGE })),
  );

  const domainFor = (axis: Axis): ScoreRange => {
    const b = bounds?.[axis];
    if (b && Number.isFinite(b[0]) && Number.isFinite(b[1]) && b[0] < b[1]) {
      return { min: b[0], max: b[1] };
    }
    return DEFAULT_SCORE_RANGE;
  };

  // When bounds arrive, expand any still-unfiltered slider to the new domain.
  useEffect(() => {
    setRanges((prev) => {
      const next = { ...prev };
      for (const a of AXES) {
        if (!filters[a.key]) next[a.key] = domainFor(a.key);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  const cityDeb = useDebouncedCallback((v: string) => {
    dispatch({
      type: "patchFilters",
      filters: { city: v.trim() || undefined },
    });
  }, 300);
  const countyDeb = useDebouncedCallback((v: string) => {
    dispatch({
      type: "patchFilters",
      filters: { county: v.trim() || undefined },
    });
  }, 300);
  const rangeDeb = useDebouncedCallback((axis: Axis, r: ScoreRange) => {
    const d = domainFor(axis);
    const cleared = r.min <= d.min && r.max >= d.max;
    dispatch({
      type: "patchFilters",
      filters: { [axis]: cleared ? undefined : r } as Partial<typeof filters>,
    });
  }, 300);

  // Keep local inputs in sync if filters are cleared elsewhere (e.g. reset).
  useEffect(() => {
    if (filters.city === undefined) setCity("");
    else if (filters.city.includes("_")) setCity(prettySlug(filters.city));
  }, [filters.city]);
  useEffect(() => {
    if (filters.county === undefined) setCounty("");
    else if (filters.county.includes("_")) setCounty(prettySlug(filters.county));
  }, [filters.county]);
  useEffect(() => {
    const anyAxis = AXES.some((a) => filters[a.key]);
    if (!anyAxis) setRanges(makeFullRanges(domainFor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.opacity,
    filters.enforcementDiscretion,
    filters.paternalism,
    filters.problemSalience,
  ]);

  const onReset = () => {
    cityDeb.cancel();
    countyDeb.cancel();
    rangeDeb.cancel();
    setCity("");
    setCounty("");
    setRanges(makeFullRanges(domainFor));
    dispatch({ type: "resetFilters" });
  };

  return (
    <>
      <Row as={motion.div} variants={item} $justify="space-between" $gap={0}>
        <SectionLabel>{ui("Filters", unhinged)}</SectionLabel>
        <HeaderActions>
          <ResetButton
            type="button"
            $variant="ghost"
            $pill
            $size="sm"
            onClick={onReset}
          >
            {ui("Reset", unhinged)}
          </ResetButton>
        </HeaderActions>
      </Row>

      <Field as={motion.div} variants={item}>
        <SectionLabel>{ui("Scores", unhinged)}</SectionLabel>
        <Stack $gap={4}>
          {AXES.map((a) => {
            const d = domainFor(a.key);
            return (
              <RangeSlider
                key={a.key}
                label={resolveAxisCopy(a.key, unhinged).label}
                domainMin={d.min}
                domainMax={d.max}
                value={ranges[a.key] ?? d}
                onChange={(r) => {
                  setRanges((prev) => ({ ...prev, [a.key]: r }));
                  rangeDeb.run(a.key, r);
                }}
              />
            );
          })}
        </Stack>
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor={`${idPrefix}-state`}>State</FieldLabel>
        <Select
          id={`${idPrefix}-state`}
          value={filters.state ?? ""}
          onChange={(e) =>
            dispatch({ type: "selectState", state: e.target.value || null })
          }
        >
          <option value="">All states</option>
          {STATE_ENTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor={`${idPrefix}-city`}>City</FieldLabel>
        <Input
          id={`${idPrefix}-city`}
          type="text"
          placeholder="e.g. Pagosa Springs"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setCounty("");
            cityDeb.run(e.target.value);
            countyDeb.cancel();
          }}
        />
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor={`${idPrefix}-county`}>County</FieldLabel>
        <Input
          id={`${idPrefix}-county`}
          type="text"
          placeholder="e.g. El Paso"
          value={county}
          onChange={(e) => {
            setCounty(e.target.value);
            setCity("");
            countyDeb.run(e.target.value);
            cityDeb.cancel();
          }}
        />
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor={`${idPrefix}-function`}>Function</FieldLabel>
        <Select
          id={`${idPrefix}-function`}
          value={filters.function ?? ""}
          onChange={(e) =>
            dispatch({
              type: "patchFilters",
              filters: { function: e.target.value || undefined },
            })
          }
        >
          <option value="">{ui("Any function", unhinged)}</option>
          {FUNCTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor={`${idPrefix}-topic`}>Topic</FieldLabel>
        <Select
          id={`${idPrefix}-topic`}
          value={filters.topic ?? ""}
          onChange={(e) =>
            dispatch({
              type: "patchFilters",
              filters: { topic: e.target.value || undefined },
            })
          }
        >
          <option value="">{ui("Any topic", unhinged)}</option>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field as={motion.div} variants={item}>
        <SectionLabel>Type</SectionLabel>
        <Segmented>
          {SUBSTANTIVE_OPTS.map((opt) => {
            const active = filters.isSubstantive === opt.value;
            return (
              <SegItem
                key={opt.label}
                type="button"
                $active={active}
                onClick={() =>
                  dispatch({
                    type: "patchFilters",
                    filters: { isSubstantive: opt.value },
                  })
                }
              >
                {active && (
                  <PillHighlight
                      layoutId={`${idPrefix}-substantive-pill`}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {ui(opt.label, unhinged)}
              </SegItem>
            );
          })}
        </Segmented>
      </Field>
    </>
  );
}

export function DesktopFilters() {
  const isCompact = useCompactLayout();
  if (isCompact) return null;
  return (
    <DesktopPanel as="aside" aria-label="Search and filters">
      <DesktopScroll as={motion.div} variants={container} initial="hidden" animate="show">
        <FilterControls idPrefix="desktop-filter" />
      </DesktopScroll>
    </DesktopPanel>
  );
}

/** Compact-only filter drawer controlled by the top-navigation FILTERS action. */
export function Sidebar() {
  const { state, dispatch } = useExplorer();
  const isCompact = useCompactLayout();

  useEffect(() => {
    if (!isCompact || !state.filtersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "closeFilters" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCompact, state.filtersOpen, dispatch]);

  if (!isCompact) return null;
  return (
    <>
      <Backdrop
        type="button"
        $open={state.filtersOpen}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => dispatch({ type: "closeFilters" })}
      />
      <MobileAside
        id="filters-panel"
        $open={state.filtersOpen}
        aria-hidden={!state.filtersOpen}
        inert={!state.filtersOpen}
        variants={container}
        initial="hidden"
        animate="show"
      >
        <FilterControls idPrefix="mobile-filter" />
      </MobileAside>
    </>
  );
}
