"use client";

// Paginated results list backed by GET /api/laws (server-side filter / sort /
// pagination). Reads `filters` from the store; each row opens the LawModal.
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  FINE_SORT_KEY,
  formatFine,
  prettySlug,
  stateName,
  type LawFilters,
  type LawSummary,
  type LawsResponse,
  type SortKey,
} from "@/lib/types";
import { resolveAxisCopy, ui } from "@/lib/copy";
import { Button } from "@/components/ui/buttons";
import { Cluster, Panel as PanelBase, Row, ScrollArea } from "@/components/ui/containers";
import { LawMarkdown } from "@/components/law/LawMarkdown";
import { Kicker, Mono } from "@/components/ui/text";

function buildQuery(f: LawFilters): string {
  const p = new URLSearchParams();
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  if (f.q) p.set("q", f.q);
  if (f.state) p.set("state", f.state);
  if (f.city) p.set("city", f.city);
  if (f.county) p.set("county", f.county);
  if (f.function) p.set("function", f.function);
  if (f.topic) p.set("topic", f.topic);
  if (f.isSubstantive !== undefined) p.set("isSubstantive", String(f.isSubstantive));
  for (const a of AXES) {
    const r = f[a.key];
    if (r) {
      p.set(`${a.key}Min`, String(r.min));
      p.set(`${a.key}Max`, String(r.max));
    }
  }
  // Penalty filters. Only "on" is meaningful: each narrows to laws the
  // LOCUS-Fines model read, so an explicit `false` would be meaningless.
  if (f.hasFine) p.set("hasFine", "true");
  if (f.perDay) p.set("perDay", "true");
  if (f.jail) p.set("jail", "true");
  if (f.fineMin !== undefined) p.set("fineMin", String(f.fineMin));
  if (f.fineMax !== undefined) p.set("fineMax", String(f.fineMax));
  if (f.penaltyNature) p.set("penaltyNature", f.penaltyNature);
  if (f.sort) {
    p.set("sort", f.sort.key);
    p.set("dir", f.sort.dir);
  }
  return p.toString();
}

/** desc → asc → off, per column. */
function nextSort(
  current: LawFilters["sort"],
  key: SortKey,
): LawFilters["sort"] {
  if (!current || current.key !== key) return { key, dir: "desc" };
  if (current.dir === "desc") return { key, dir: "asc" };
  return null;
}

const Panel = styled(PanelBase)`
  min-height: 0;
  height: 100%;
  align-self: stretch;

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    min-height: 320px;
    height: min(72dvh, 720px);
  }
`;

const Toolbar = styled(Row)`
  justify-content: space-between;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    align-items: stretch;
    flex-direction: column;
    gap: ${({ theme }) => theme.space(2)};
  }
`;

// Subtle "updating…" affordance shown during stale-while-revalidate refreshes.
// `text-transform: none` opts out of the uppercase Kicker it sits inside.
const Updating = styled(motion.span)`
  margin-left: ${({ theme }) => theme.space(2)};
  color: ${({ theme }) => theme.colors.g76};
  text-transform: none;
`;

const SortBar = styled(Cluster)`
  justify-content: flex-end;

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SortButton = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.g12 : "transparent")};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.g60 : theme.colors.g08)};
  color: ${({ $active, theme }) => ($active ? theme.colors.fg : theme.colors.g68)};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(1.5)};
  cursor: pointer;
  white-space: nowrap;

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    min-height: 32px;
  }
`;

const Scroll = styled(ScrollArea)<{ $stale?: boolean }>`
  transition: opacity ${({ theme }) => theme.motion.base}s ease;
  opacity: ${({ $stale }) => ($stale ? 0.6 : 1)};
`;

// Eight laws make up a page. Let those rows share the entire scroll viewport
// instead of collecting at its top, while retaining a usable minimum row
// height that naturally enables internal scrolling in short viewports.
const ResultRows = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
`;

const ResultRow = styled(motion.button)`
  flex: 1 0 64px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${({ theme }) => theme.space(4)};
  align-items: center;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  cursor: pointer;
  color: ${({ theme }) => theme.colors.fg};

  &:hover {
    background: ${({ theme }) => theme.colors.g04};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    gap: ${({ theme }) => theme.space(2)};
    padding: ${({ theme }) => theme.space(3)};
  }
`;

const RowMain = styled.div`
  min-width: 0;
`;

const RowTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSize.md};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowMeta = styled.div`
  margin-top: ${({ theme }) => theme.space(1)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g76};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Scores = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space(3)};
`;

const Score = styled.div<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 34px;
  color: ${({ $active, theme }) => ($active ? theme.colors.fg : theme.colors.g76)};

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    display: ${({ $active }) => ($active ? "flex" : "none")};
  }
`;

/**
 * The stated fine, shown on every row regardless of the active map layer —
 * this is what keeps fines from disappearing when a score axis is selected.
 * Stays visible at the narrow breakpoint where the scores collapse.
 */
const Fine = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 52px;
  color: ${({ theme }) => theme.colors.penalty};
`;

const ScoreKey = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 9px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.g76};
`;

const ScoreVal = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const Centered = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space(8)};
  color: ${({ theme }) => theme.colors.g76};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
`;

const SkeletonRow = styled(motion.div)`
  flex: 1 0 64px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${({ theme }) => theme.space(4)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
`;

const Bar = styled.div<{ $w: string }>`
  height: 12px;
  width: ${({ $w }) => $w};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.g08};
`;

const Pager = styled(Row)`
  justify-content: space-between;
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
`;

// Reuses the ghost Button; only the pager padding is tuned to the original.
const PageButton = styled(Button)`
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
`;

const PageInfo = styled(Mono)`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g68};
`;

function fmt(n: number): string {
  return n.toFixed(2);
}

export function ResultsPanel() {
  const { state, dispatch } = useExplorer();
  const { filters, unhinged } = state;
  const query = useMemo(() => buildQuery(filters), [filters]);

  // `data` holds the last successful response and is intentionally NOT cleared
  // between queries, so the previous page stays visible while a new one loads.
  const [data, setData] = useState<LawsResponse | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const ctrl = new AbortController();
    setIsFetching(true);
    setError(false);
    fetch(`/api/laws?${query}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LawsResponse>;
      })
      .then((json) => {
        if (id !== reqId.current) return;
        setData(json);
        setIsFetching(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted || id !== reqId.current) return;
        setError(true);
        setIsFetching(false);
        void err;
      });
    return () => ctrl.abort();
  }, [query]);

  const total = data?.total ?? 0;
  const pageSize = filters.pageSize;
  const page = filters.page;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.rows ?? [];

  // Stale-while-revalidate: skeletons only when there is nothing to show yet;
  // once the first page has loaded we keep it (subtly dimmed) while refetching.
  const isInitialLoading = isFetching && data === null;
  const isRevalidating = isFetching && data !== null;
  const showError = error && data === null;

  return (
    <Panel>
      <Toolbar $gap={3}>
        <Kicker>
          {isInitialLoading
            ? ui("Loading…", unhinged)
            : unhinged
              ? `${total.toLocaleString()} ORDINANCES FROM THE VOID`
              : `${total.toLocaleString()} result${total === 1 ? "" : "s"}`}
          {isRevalidating && (
            <Updating
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            >
              updating…
            </Updating>
          )}
        </Kicker>
        <SortBar $gap={1}>
          {AXES.map((a) => {
            const active = filters.sort?.key === a.key;
            const arrow = active ? (filters.sort?.dir === "asc" ? " ↑" : " ↓") : "";
            return (
              <SortButton
                key={a.key}
                $active={active}
                onClick={() =>
                  dispatch({
                    type: "patchFilters",
                    filters: { sort: nextSort(filters.sort, a.key) },
                  })
                }
                title={`Sort by ${resolveAxisCopy(a.key, unhinged).label}`}
              >
                {unhinged
                  ? resolveAxisCopy(a.key, unhinged).label
                  : resolveAxisCopy(a.key, unhinged).label.split(" ")[0]}
                {arrow}
              </SortButton>
            );
          })}
          {/* Ranking by fine only makes sense for laws that state one, so this
              narrows to those — which is also what "biggest fine in the US"
              means. Present on every layer. */}
          <SortButton
            $active={filters.sort?.key === FINE_SORT_KEY}
            onClick={() =>
              dispatch({
                type: "patchFilters",
                filters: { sort: nextSort(filters.sort, FINE_SORT_KEY) },
              })
            }
            title="Sort by the stated fine (laws that state one)"
          >
            {ui("Fine", unhinged)}
            {filters.sort?.key === FINE_SORT_KEY
              ? filters.sort.dir === "asc"
                ? " ↑"
                : " ↓"
              : ""}
          </SortButton>
        </SortBar>
      </Toolbar>

      <Scroll $stale={isRevalidating}>
        {isInitialLoading ? (
          <ResultRows>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow
                key={i}
                animate={{ opacity: [0.35, 0.7, 0.35] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.08 }}
              >
                <div>
                  <Bar $w="60%" />
                  <div style={{ height: 8 }} />
                  <Bar $w="35%" />
                </div>
                <Bar $w="140px" />
              </SkeletonRow>
            ))}
          </ResultRows>
        ) : showError ? (
          <Centered>Could not load results. Is the database seeded?</Centered>
        ) : rows.length === 0 ? (
          <Centered>{ui("No laws match these filters.", unhinged)}</Centered>
        ) : (
          <ResultRows>
            <AnimatePresence initial={false}>
              {rows.map((law: LawSummary, i) => (
                <ResultRow
                  key={law.id}
                  type="button"
                  onClick={() => dispatch({ type: "openLaw", law })}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.02, 0.2) }}
                >
                  <RowMain>
                    <RowTitle>
                      {law.header?.trim() ? (
                        <LawMarkdown compact title>
                          {law.header}
                        </LawMarkdown>
                      ) : (
                        "Untitled provision"
                      )}
                    </RowTitle>
                    <RowMeta>
                      {stateName(law.state)}
                      {law.city ? ` · ${prettySlug(law.city)}` : ""}
                      {law.county ? ` · ${prettySlug(law.county)}` : ""}
                      {law.function ? ` · ${law.function}` : ""}
                      {law.topic ? ` · ${law.topic}` : ""}
                    </RowMeta>
                  </RowMain>
                  <Scores>
                    {AXES.map((a) => (
                      <Score
                        key={a.key}
                        $active={
                          state.layer === "scores" && state.axis === a.key
                        }
                      >
                        <ScoreKey>{resolveAxisCopy(a.key, unhinged).label.slice(0, 3).toUpperCase()}</ScoreKey>
                        <ScoreVal>{fmt(law[a.key])}</ScoreVal>
                      </Score>
                    ))}
                    {law.fine != null && (
                      <Fine>
                        <ScoreKey>FINE</ScoreKey>
                        <ScoreVal>{formatFine(law.fine)}</ScoreVal>
                      </Fine>
                    )}
                  </Scores>
                </ResultRow>
              ))}
            </AnimatePresence>
          </ResultRows>
        )}
      </Scroll>

      <Pager $gap={3}>
        <PageButton
          type="button"
          $variant="ghost"
          $size="sm"
          disabled={page <= 1 || isFetching}
          onClick={() => dispatch({ type: "setPage", page: page - 1 })}
        >
          {unhinged ? "← RETREAT" : "← Prev"}
        </PageButton>
        <PageInfo>
          Page {page} of {totalPages}
        </PageInfo>
        <PageButton
          type="button"
          $variant="ghost"
          $size="sm"
          disabled={page >= totalPages || isFetching}
          onClick={() => dispatch({ type: "setPage", page: page + 1 })}
        >
          {unhinged ? "CONTINUE SUFFERING →" : "Next →"}
        </PageButton>
      </Pager>
    </Panel>
  );
}
