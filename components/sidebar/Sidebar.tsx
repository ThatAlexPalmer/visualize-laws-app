"use client";

// Search + filter rail. All controls are wired to the store's `filters`; text /
// slider inputs are debounced (~300ms) before dispatching to avoid query spam.
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  DEFAULT_SCORE_RANGE,
  FUNCTIONS,
  STATE_NAMES,
  TOPICS,
  type Axis,
  type AxisBounds,
  type JurisdictionsResponse,
  type ScoreRange,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
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

// A debounced wrapper around a callback. `cancel` lets the reset action drop any
// pending dispatch so a late timer can't re-apply a just-cleared filter.
function useDebouncedCallback<A extends unknown[]>(
  cb: (...args: A) => void,
  delay: number,
) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => cancel, []);
  const run = (...args: A) => {
    cancel();
    timer.current = setTimeout(() => cbRef.current(...args), delay);
  };
  return { run, cancel };
}

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
  min-height: 640px;
  height: auto;
  align-self: stretch;
`;

const DesktopScroll = styled(ScrollArea)`
  /* On desktop the full form defines the shared workspace row height. Keeping
     this content in normal flow avoids a nested scrollbar, while the adjacent
     results panel stretches to the same bottom edge and scrolls only its laws. */
  flex: 0 0 auto;
  min-height: auto;
  overflow-y: visible;
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
  const { filters, unhinged } = state;

  const [bounds, setBounds] = useState<AxisBounds | null>(null);
  const [q, setQ] = useState(filters.q ?? "");
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

  // Fetch national bounds once to set the slider domains. Tolerates an empty DB
  // (national === null) by falling back to DEFAULT_SCORE_RANGE.
  useEffect(() => {
    let ignore = false;
    const ctrl = new AbortController();
    fetch("/api/jurisdictions", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<JurisdictionsResponse>) : null))
      .then((data) => {
        if (ignore || !data?.national?.bounds) return;
        setBounds(data.national.bounds);
      })
      .catch(() => {});
    return () => {
      ignore = true;
      ctrl.abort();
    };
  }, []);

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

  const qDeb = useDebouncedCallback((v: string) => {
    dispatch({ type: "patchFilters", filters: { q: v.trim() || undefined } });
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
    if (filters.q === undefined) setQ("");
  }, [filters.q]);
  useEffect(() => {
    if (filters.county === undefined) setCounty("");
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
    qDeb.cancel();
    countyDeb.cancel();
    rangeDeb.cancel();
    setQ("");
    setCounty("");
    setRanges(makeFullRanges(domainFor));
    dispatch({ type: "resetFilters" });
  };

  return (
    <>
      <Row as={motion.div} variants={item} $justify="space-between" $gap={0}>
        <SectionLabel>{ui("Search & Filters", unhinged)}</SectionLabel>
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
        <FieldLabel htmlFor={`${idPrefix}-q`}>Keyword</FieldLabel>
        <Input
          id={`${idPrefix}-q`}
          type="search"
          placeholder="Search law text…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            qDeb.run(e.target.value);
          }}
        />
      </Field>

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
        <FieldLabel htmlFor={`${idPrefix}-county`}>County</FieldLabel>
        <Input
          id={`${idPrefix}-county`}
          type="text"
          placeholder="e.g. Cook"
          value={county}
          onChange={(e) => {
            setCounty(e.target.value);
            countyDeb.run(e.target.value);
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
