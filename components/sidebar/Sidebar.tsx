"use client";

// Advanced filter rail. Non-place controls patch `filters`. City/county go
// through `resolveQueryFocus` / `setPlaceText` so they share QuickSearch's
// resolver. Text and slider inputs debounce (~300ms) before dispatch.
// One instance: the shell restyles at the compact breakpoint instead of remounting.
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { queryFilters, useExplorer } from "@/lib/store";
import { cityFilter, countyFilter, focusState } from "@/lib/place";
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
  resolveQueryFocus,
} from "@/lib/placeLookup";
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

const PLACE_FIELDS = [
  { field: "city" as const, label: "City", placeholder: "e.g. Pagosa Springs" },
  { field: "county" as const, label: "County", placeholder: "e.g. El Paso" },
];

const ENUM_FIELDS = [
  { id: "filter-function", label: "Function", key: "function" as const, empty: "Any function", options: FUNCTIONS },
  { id: "filter-topic", label: "Topic", key: "topic" as const, empty: "Any topic", options: TOPICS },
];

const FLAG_TOGGLES = [
  { key: "jail" as const, label: "Jail" },
  { key: "perDay" as const, label: "Per day" },
];

const FilterSlot = styled.div`
  min-height: 0;
  height: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    grid-column: 1;
    grid-row: 1;
    height: 0;
    min-height: 0;
    border: 0;
    overflow: visible;
    pointer-events: none;
  }
`;

const FilterChrome = styled(PanelBase)<{ $open: boolean }>`
  min-height: 0;
  height: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  border-top: 0;
  border-bottom: 0;
  border-left: 0;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    position: fixed;
    inset: 59px 0 auto;
    width: 100%;
    min-height: auto;
    height: fit-content;
    max-height: calc(100dvh - 59px);
    align-self: auto;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.bg};
    border: 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.g20};
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
    z-index: ${({ theme }) => theme.z.sheet};
    visibility: ${({ $open }) => ($open ? "visible" : "hidden")};
    pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
    transform: translate3d(0, ${({ $open }) => ($open ? "0" : "-100%")}, 0);
    will-change: transform;
    transition:
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear ${({ $open }) => ($open ? "0s" : "240ms")};
  }
`;

const FilterScroll = styled(ScrollArea)`
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

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    flex: 0 1 auto;
    gap: ${({ theme }) => theme.space(5)};
    padding: ${({ theme }) => theme.space(4)};
    padding-left: max(${({ theme }) => theme.space(4)}, calc((100vw - 640px) / 2));
    padding-right: max(${({ theme }) => theme.space(4)}, calc((100vw - 640px) / 2));

    ${Field} {
      gap: ${({ theme }) => theme.space(2)};
    }

    ${Stack} {
      gap: ${({ theme }) => theme.space(4)};
    }

    ${Input},
    ${Select} {
      padding: 10px 12px;
    }

    ${Segmented} {
      padding: 3px;
    }

    ${SegItem} {
      padding: ${({ theme }) => theme.space(1.5)} 0;
    }
  }
`;

const Backdrop = styled.button<{ $open: boolean }>`
  display: none;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    display: block;
    position: fixed;
    inset: 59px 0 0;
    z-index: ${({ theme }) => theme.z.sheet};
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

function FilterControls() {
  const { state, dispatch } = useExplorer();
  const { data } = useJurisdictions();
  const filters = queryFilters(state);
  const { unhinged } = state;
  const selectedState = focusState(state.focus);
  const bounds = data?.national?.bounds ?? null;
  const placeLookupAbort = useRef<AbortController | null>(null);
  const dirtyAxes = useRef(new Set<Axis>());

  const [placeText, setPlaceText] = useState({
    city: filters.city ?? "",
    county: filters.county ?? "",
  });
  const [ranges, setRanges] = useState<Record<Axis, ScoreRange>>(() =>
    makeFullRanges((axis) => filters[axis] ?? { ...DEFAULT_SCORE_RANGE }),
  );
  const rangesRef = useRef(ranges);

  const domainFor = (axis: Axis): ScoreRange => {
    const b = bounds?.[axis];
    if (b && Number.isFinite(b[0]) && Number.isFinite(b[1]) && b[0] < b[1]) {
      return { min: b[0], max: b[1] };
    }
    return DEFAULT_SCORE_RANGE;
  };

  const applyPlace = async (
    field: "city" | "county",
    v: string,
  ): Promise<void> => {
    placeLookupAbort.current?.abort();
    const trimmed = v.trim();
    if (!trimmed) {
      if (selectedState) {
        dispatch({
          type: "selectFocus",
          focus: { kind: "state", state: selectedState },
        });
      } else {
        dispatch({ type: "setPlaceText", field, value: undefined });
      }
      return;
    }
    if (trimmed.length < MIN_PLACE_ZOOM_CHARS) {
      dispatch({ type: "setPlaceText", field, value: trimmed });
      return;
    }
    placeLookupAbort.current?.abort();
    const ac = new AbortController();
    placeLookupAbort.current = ac;
    try {
      const focus = await resolveQueryFocus(trimmed, {
        currentState: selectedState,
        uniqueOnly: true,
        prefer: field,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (focus) {
        dispatch({ type: "selectFocus", focus });
        return;
      }
    } catch {
      if (ac.signal.aborted) return;
    }
    dispatch({ type: "setPlaceText", field, value: trimmed });
  };

  const cityDeb = useDebouncedCallback((v: string) => {
    void applyPlace("city", v);
  }, 300);
  const countyDeb = useDebouncedCallback((v: string) => {
    void applyPlace("county", v);
  }, 300);
  const rangeDeb = useDebouncedCallback((next: Record<Axis, ScoreRange>) => {
    const patch = Object.fromEntries(
      AXES.map((a) => {
        const d = domainFor(a.key);
        const r = next[a.key] ?? d;
        return [a.key, r.min <= d.min && r.max >= d.max ? undefined : r];
      }),
    );
    dirtyAxes.current.clear();
    dispatch({ type: "patchFilters", filters: patch });
  }, 300);

  // When bounds arrive, expand idle sliders only — in-flight edits stay dirty.
  useEffect(() => {
    setRanges((prev) => {
      const next = { ...prev };
      for (const a of AXES) {
        if (filters[a.key] || dirtyAxes.current.has(a.key)) continue;
        next[a.key] = domainFor(a.key);
      }
      rangesRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  useEffect(() => () => {
    placeLookupAbort.current?.abort();
  }, []);

  // Keep local inputs in sync with the store (chips, map clicks, reset).
  useEffect(() => {
    const text = (value: string | undefined) =>
      value == null ? "" : prettySlug(value);
    setPlaceText({
      city: text(cityFilter(state.focus, state.placeDraft)),
      county: text(countyFilter(state.focus, state.placeDraft)),
    });
  }, [state.focus, state.placeDraft]);
  useEffect(() => {
    setRanges((previous) => {
      const next = { ...previous };
      for (const a of AXES) {
        if (dirtyAxes.current.has(a.key)) continue;
        next[a.key] = filters[a.key] ?? domainFor(a.key);
      }
      rangesRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.opacity,
    filters.enforcementDiscretion,
    filters.paternalism,
    filters.problemSalience,
  ]);

  const onReset = () => {
    placeLookupAbort.current?.abort();
    dirtyAxes.current.clear();
    cityDeb.cancel();
    countyDeb.cancel();
    rangeDeb.cancel();
    setPlaceText({ city: "", county: "" });
    const next = makeFullRanges(domainFor);
    rangesRef.current = next;
    setRanges(next);
    dispatch({ type: "resetFilters" });
  };

  // `layoutId` is per control so the Type and Fines pills do not share one animation.
  const segments = (
    key: "isSubstantive" | "hasFine",
    options: readonly { label: string; value: boolean | undefined }[],
    layoutId: string,
  ) => (
    <Segmented>
      {options.map((opt) => {
        const active = filters[key] === opt.value;
        return (
          <SegItem
            key={opt.label}
            type="button"
            $active={active}
            aria-pressed={active}
            onClick={() =>
              dispatch({ type: "patchFilters", filters: { [key]: opt.value } })
            }
          >
            {active && (
              <PillHighlight
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {ui(opt.label, unhinged)}
          </SegItem>
        );
      })}
    </Segmented>
  );

  return (
    <>
      <Row as={motion.div} variants={item} $justify="space-between" $gap={0}>
        <SectionLabel>{ui("Filters", unhinged)}</SectionLabel>
        <HeaderActions>
          <ResetButton
            type="button"
            $variant="ghost"
            $pill
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
                  dirtyAxes.current.add(a.key);
                  const next = { ...rangesRef.current, [a.key]: r };
                  rangesRef.current = next;
                  setRanges(next);
                  rangeDeb.run(next);
                }}
              />
            );
          })}
        </Stack>
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor="filter-state">State</FieldLabel>
        <Select
          id="filter-state"
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

      {PLACE_FIELDS.map(({ field, label, placeholder }) => {
        const other = field === "city" ? "county" : "city";
        const debounced = field === "city" ? cityDeb : countyDeb;
        const otherDebounced = field === "city" ? countyDeb : cityDeb;
        return (
          <Field as={motion.div} variants={item} key={field}>
            <FieldLabel htmlFor={`filter-${field}`}>{label}</FieldLabel>
            <Input
              id={`filter-${field}`}
              type="text"
              placeholder={placeholder}
              value={placeText[field]}
              onChange={(e) => {
                const value = e.target.value;
                placeLookupAbort.current?.abort();
                setPlaceText((current) => {
                  const next = { ...current, [field]: value };
                  if (placeText[other]) next[other] = "";
                  return next;
                });
                debounced.run(value);
                if (placeText[other]) otherDebounced.cancel();
              }}
            />
          </Field>
        );
      })}

      {ENUM_FIELDS.map((field) => (
        <Field as={motion.div} variants={item} key={field.key}>
          <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
          <Select
            id={field.id}
            value={filters[field.key] ?? ""}
            onChange={(e) =>
              dispatch({
                type: "patchFilters",
                filters: { [field.key]: e.target.value || undefined },
              })
            }
          >
            <option value="">{ui(field.empty, unhinged)}</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      ))}

      <Field as={motion.div} variants={item}>
        <SectionLabel>Type</SectionLabel>
        {segments("isSubstantive", SUBSTANTIVE_OPTS, "filter-substantive-pill")}
      </Field>

      <Field as={motion.div} variants={item}>
        <SectionLabel>{ui("Fines", unhinged)}</SectionLabel>
        {segments("hasFine", FINE_OPTS, "filter-fine-pill")}

        <ToggleRow>
          {FLAG_TOGGLES.map((toggle) => (
            <ToggleChip
              key={toggle.key}
              type="button"
              $variant="ghost"
              $pill
              $on={filters[toggle.key] === true}
              aria-pressed={filters[toggle.key] === true}
              onClick={() =>
                dispatch({
                  type: "patchFilters",
                  filters: {
                    [toggle.key]: filters[toggle.key] ? undefined : true,
                  },
                })
              }
            >
              {ui(toggle.label, unhinged)}
            </ToggleChip>
          ))}
        </ToggleRow>

        <Select
          id="filter-penalty-nature"
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

/** Single filter instance. Desktop: in-flow rail. Compact: FILTERS drawer. */
export function Sidebar() {
  const { state, dispatch } = useExplorer();
  const isCompact = useCompactLayout();
  const compactClosed = isCompact && !state.filtersOpen;

  useEffect(() => {
    if (!isCompact) dispatch({ type: "closeFilters" });
  }, [isCompact, dispatch]);

  return (
    <FilterSlot data-filter-shell>
      <Backdrop
        type="button"
        $open={state.filtersOpen}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => dispatch({ type: "closeFilters" })}
      />
      <FilterChrome
        as="aside"
        id="filters-panel"
        aria-label="Search and filters"
        $open={state.filtersOpen}
        aria-hidden={compactClosed}
        inert={compactClosed}
      >
        <FilterScroll as={motion.div} variants={container} initial="hidden" animate="show">
          <FilterControls />
        </FilterScroll>
      </FilterChrome>
    </FilterSlot>
  );
}
