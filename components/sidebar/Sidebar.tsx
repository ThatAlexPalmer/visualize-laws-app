"use client";

// Advanced filter rail. All controls are wired to the store's `filters`; text
// and slider inputs are debounced (~300ms) before dispatching to avoid query spam.
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
  isPenaltyNature,
  prettySlug,
  type Axis,
  type PenaltyNature,
  type ScoreRange,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import { useCompactLayout } from "@/lib/useCompactLayout";
import {
  MIN_PLACE_ZOOM_CHARS,
  lookupPlaces,
} from "@/components/jurisdiction/placeLookup";
import {
  loadCountyFeatures,
  matchAtlasCounties,
} from "@/components/map/counties";
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

const FINE_OPTS: { label: string; value: boolean | undefined }[] = [
  { label: "All", value: undefined },
  { label: "States a fine", value: true },
];

const NATURE_OPTS: { label: string; value: PenaltyNature }[] = [
  { label: "Criminal", value: "criminal" },
  { label: "Civil", value: "civil" },
  { label: "Criminal and civil", value: "both" },
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

/** Two independent booleans, so toggles rather than an exclusive Segmented. */
const ToggleRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space(2)};
`;

const ToggleChip = styled(Button)<{ $on: boolean }>`
  flex: 1;
  background: ${({ $on, theme }) => ($on ? theme.colors.fg : "transparent")};
  border-color: ${({ $on, theme }) => ($on ? theme.colors.fg : theme.colors.g20)};
  color: ${({ $on, theme }) => ($on ? theme.colors.bg : theme.colors.g76)};

  &:hover:not(:disabled) {
    color: ${({ $on, theme }) => ($on ? theme.colors.bg : theme.colors.fg)};
  }
`;

const FieldHint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSize.xs};
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.g60};
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
  const placeLookupAbort = useRef<AbortController | null>(null);

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
    void applyCity(v);
  }, 300);
  const countyDeb = useDebouncedCallback((v: string) => {
    void applyCounty(v);
  }, 300);

  const applyCity = async (v: string): Promise<void> => {
    const trimmed = v.trim();
    if (!trimmed) {
      dispatch({ type: "patchFilters", filters: { city: undefined } });
      return;
    }
    if (trimmed.length < MIN_PLACE_ZOOM_CHARS) {
      dispatch({ type: "patchFilters", filters: { city: trimmed } });
      return;
    }
    placeLookupAbort.current?.abort();
    const ac = new AbortController();
    placeLookupAbort.current = ac;
    try {
      const places = await lookupPlaces("city", trimmed, ac.signal);
      if (ac.signal.aborted) return;
      if (places.length === 1 && places[0].city && places[0].state) {
        dispatch({
          type: "selectPlace",
          state: places[0].state,
          city: places[0].city,
        });
        return;
      }
    } catch {
      if (ac.signal.aborted) return;
    }
    dispatch({ type: "patchFilters", filters: { city: trimmed } });
  };

  const applyCounty = async (v: string): Promise<void> => {
    const trimmed = v.trim();
    if (!trimmed) {
      dispatch({ type: "patchFilters", filters: { county: undefined } });
      return;
    }
    if (trimmed.length < MIN_PLACE_ZOOM_CHARS) {
      dispatch({ type: "patchFilters", filters: { county: trimmed } });
      return;
    }
    placeLookupAbort.current?.abort();
    const ac = new AbortController();
    placeLookupAbort.current = ac;
    void loadCountyFeatures();
    try {
      const places = await lookupPlaces("county", trimmed, ac.signal);
      if (ac.signal.aborted) return;
      if (places.length === 1 && places[0].county && places[0].state) {
        dispatch({
          type: "selectPlace",
          state: places[0].state,
          county: places[0].county,
        });
        return;
      }
      const atlas = matchAtlasCounties(await loadCountyFeatures(), trimmed);
      if (ac.signal.aborted) return;
      if (atlas.length === 1) {
        dispatch({
          type: "selectPlace",
          state: atlas[0].state,
          atlasCountyName: atlas[0].name,
        });
        return;
      }
    } catch {
      if (ac.signal.aborted) return;
    }
    dispatch({ type: "patchFilters", filters: { county: trimmed } });
  };
  const rangeDeb = useDebouncedCallback((axis: Axis, r: ScoreRange) => {
    const d = domainFor(axis);
    const cleared = r.min <= d.min && r.max >= d.max;
    dispatch({
      type: "patchFilters",
      filters: { [axis]: cleared ? undefined : r } as Partial<typeof filters>,
    });
  }, 300);

  // Keep local inputs in sync with the store (chips, map clicks, reset).
  useEffect(() => {
    setCity(filters.city == null ? "" : prettySlug(filters.city));
  }, [filters.city]);
  useEffect(() => {
    setCounty(filters.county == null ? "" : prettySlug(filters.county));
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
            cityDeb.run(e.target.value);
            if (county) {
              setCounty("");
              countyDeb.cancel();
            }
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
            countyDeb.run(e.target.value);
            if (city) {
              setCity("");
              cityDeb.cancel();
            }
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

      <Field as={motion.div} variants={item}>
        <SectionLabel>{ui("Fines", unhinged)}</SectionLabel>
        <Segmented>
          {FINE_OPTS.map((opt) => {
            const active = (filters.hasFine ?? undefined) === opt.value;
            return (
              <SegItem
                key={opt.label}
                type="button"
                $active={active}
                onClick={() =>
                  dispatch({
                    type: "patchFilters",
                    filters: { hasFine: opt.value },
                  })
                }
              >
                {active && (
                  <PillHighlight
                    layoutId={`${idPrefix}-fine-pill`}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {ui(opt.label, unhinged)}
              </SegItem>
            );
          })}
        </Segmented>

        <ToggleRow>
          <ToggleChip
            type="button"
            $variant="ghost"
            $pill
            $size="sm"
            $on={filters.jail === true}
            aria-pressed={filters.jail === true}
            onClick={() =>
              dispatch({
                type: "patchFilters",
                filters: { jail: filters.jail ? undefined : true },
              })
            }
          >
            {ui("Jail", unhinged)}
          </ToggleChip>
          <ToggleChip
            type="button"
            $variant="ghost"
            $pill
            $size="sm"
            $on={filters.perDay === true}
            aria-pressed={filters.perDay === true}
            onClick={() =>
              dispatch({
                type: "patchFilters",
                filters: { perDay: filters.perDay ? undefined : true },
              })
            }
          >
            {ui("Per day", unhinged)}
          </ToggleChip>
        </ToggleRow>

        <Select
          id={`${idPrefix}-penalty-nature`}
          aria-label="Fine type"
          value={filters.penaltyNature ?? ""}
          onChange={(e) =>
            dispatch({
              type: "patchFilters",
              filters: {
                penaltyNature: isPenaltyNature(e.target.value)
                  ? e.target.value
                  : undefined,
              },
            })
          }
        >
          <option value="">{ui("Any type", unhinged)}</option>
          {NATURE_OPTS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <FieldHint>
          {ui(
            "These only include laws checked for a stated fine, so the list gets shorter.",
            unhinged,
          )}
        </FieldHint>
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
