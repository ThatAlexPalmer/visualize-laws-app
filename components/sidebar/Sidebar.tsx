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
import { Row, SectionLabel, Stack } from "@/components/ui/containers";

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

const Aside = styled(motion.aside)`
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid ${({ theme }) => theme.colors.g12};
  padding: ${({ theme }) => theme.space(4)};
  overflow-y: auto;
  z-index: ${({ theme }) => theme.z.sidebar};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space(5)};

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    display: none;
  }
`;

// The Reset control reuses the Button primitive (ghost variant); it only dims
// the resting label to g64 and keeps a subtle press affordance.
const ResetButton = styled(Button)`
  color: ${({ theme }) => theme.colors.g64};

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

export function Sidebar() {
  const { state, dispatch } = useExplorer();
  const { filters } = state;

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
    <Aside variants={container} initial="hidden" animate="show">
      <Row as={motion.div} variants={item} $justify="space-between" $gap={0}>
        <SectionLabel>Search &amp; Filters</SectionLabel>
        <ResetButton
          type="button"
          $variant="ghost"
          $pill
          $size="sm"
          onClick={onReset}
        >
          Reset
        </ResetButton>
      </Row>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor="q">Keyword</FieldLabel>
        <Input
          id="q"
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
        <SectionLabel>Scores</SectionLabel>
        <Stack $gap={4}>
          {AXES.map((a) => {
            const d = domainFor(a.key);
            return (
              <RangeSlider
                key={a.key}
                label={a.label}
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
        <FieldLabel htmlFor="state">State</FieldLabel>
        <Select
          id="state"
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
        <FieldLabel htmlFor="county">County</FieldLabel>
        <Input
          id="county"
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
        <FieldLabel htmlFor="function">Function</FieldLabel>
        <Select
          id="function"
          value={filters.function ?? ""}
          onChange={(e) =>
            dispatch({
              type: "patchFilters",
              filters: { function: e.target.value || undefined },
            })
          }
        >
          <option value="">Any function</option>
          {FUNCTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Field>

      <Field as={motion.div} variants={item}>
        <FieldLabel htmlFor="topic">Topic</FieldLabel>
        <Select
          id="topic"
          value={filters.topic ?? ""}
          onChange={(e) =>
            dispatch({
              type: "patchFilters",
              filters: { topic: e.target.value || undefined },
            })
          }
        >
          <option value="">Any topic</option>
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
                    layoutId="substantive-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {opt.label}
              </SegItem>
            );
          })}
        </Segmented>
      </Field>
    </Aside>
  );
}
