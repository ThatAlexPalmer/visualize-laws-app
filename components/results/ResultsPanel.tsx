"use client";

// Paginated results list backed by GET /api/laws (server-side filter / sort /
// pagination). Reads `filters` from the store; each row opens the LawModal.
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorer } from "@/lib/store";
import {
  AXES,
  stateName,
  type Axis,
  type LawFilters,
  type LawRecord,
  type LawsResponse,
} from "@/lib/types";

function buildQuery(f: LawFilters): string {
  const p = new URLSearchParams();
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  if (f.q) p.set("q", f.q);
  if (f.state) p.set("state", f.state);
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
  if (f.sort) {
    p.set("sort", f.sort.axis);
    p.set("dir", f.sort.dir);
  }
  return p.toString();
}

function nextSort(
  current: LawFilters["sort"],
  axis: Axis,
): LawFilters["sort"] {
  if (!current || current.axis !== axis) return { axis, dir: "desc" };
  if (current.dir === "desc") return { axis, dir: "asc" };
  return null;
}

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 320px;
  border: 1px solid ${({ theme }) => theme.colors.g08};
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
`;

const Count = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.g48};
`;

const SortBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space(1)};
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const SortButton = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.g12 : "transparent")};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.g32 : theme.colors.g08)};
  color: ${({ $active, theme }) => ($active ? theme.colors.fg : theme.colors.g48)};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  padding: ${({ theme }) => theme.space(1)} ${({ theme }) => theme.space(1.5)};
  cursor: pointer;
  white-space: nowrap;
`;

const Scroll = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const Row = styled(motion.button)`
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
  color: ${({ theme }) => theme.colors.g48};
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
  color: ${({ $active, theme }) => ($active ? theme.colors.fg : theme.colors.g48)};
`;

const ScoreKey = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 9px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.g32};
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
  color: ${({ theme }) => theme.colors.g32};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  text-align: center;
`;

const SkeletonRow = styled(motion.div)`
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

const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space(3)};
  padding: ${({ theme }) => theme.space(3)} ${({ theme }) => theme.space(4)};
  border-top: 1px solid ${({ theme }) => theme.colors.g08};
`;

const PageButton = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.g20};
  color: ${({ theme }) => theme.colors.fg};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(3)};
  cursor: pointer;

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.colors.g48};
`;

function fmt(n: number): string {
  return n.toFixed(2);
}

export function ResultsPanel() {
  const { state, dispatch } = useExplorer();
  const { filters } = state;
  const query = useMemo(() => buildQuery(filters), [filters]);

  const [data, setData] = useState<LawsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`/api/laws?${query}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LawsResponse>;
      })
      .then((json) => {
        if (id !== reqId.current) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted || id !== reqId.current) return;
        setError(true);
        setLoading(false);
        void err;
      });
    return () => ctrl.abort();
  }, [query]);

  const total = data?.total ?? 0;
  const pageSize = filters.pageSize;
  const page = filters.page;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.rows ?? [];

  return (
    <Panel>
      <Toolbar>
        <Count>
          {loading ? "Loading…" : `${total.toLocaleString()} result${total === 1 ? "" : "s"}`}
        </Count>
        <SortBar>
          {AXES.map((a) => {
            const active = filters.sort?.axis === a.key;
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
                title={`Sort by ${a.label}`}
              >
                {a.label.split(" ")[0]}
                {arrow}
              </SortButton>
            );
          })}
        </SortBar>
      </Toolbar>

      <Scroll>
        {loading ? (
          <div>
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
          </div>
        ) : error ? (
          <Centered>Could not load results. Is the database seeded?</Centered>
        ) : rows.length === 0 ? (
          <Centered>No laws match these filters.</Centered>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((law: LawRecord, i) => (
              <Row
                key={law.id}
                type="button"
                onClick={() => dispatch({ type: "openLaw", law })}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.02, 0.2) }}
              >
                <RowMain>
                  <RowTitle>{law.header?.trim() || "Untitled provision"}</RowTitle>
                  <RowMeta>
                    {stateName(law.state)}
                    {law.city ? ` · ${law.city}` : ""}
                    {law.function ? ` · ${law.function}` : ""}
                    {law.topic ? ` · ${law.topic}` : ""}
                  </RowMeta>
                </RowMain>
                <Scores>
                  {AXES.map((a) => (
                    <Score key={a.key} $active={state.axis === a.key}>
                      <ScoreKey>{a.label.slice(0, 3).toUpperCase()}</ScoreKey>
                      <ScoreVal>{fmt(law[a.key])}</ScoreVal>
                    </Score>
                  ))}
                </Scores>
              </Row>
            ))}
          </AnimatePresence>
        )}
      </Scroll>

      <Pager>
        <PageButton
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => dispatch({ type: "setPage", page: page - 1 })}
        >
          ← Prev
        </PageButton>
        <PageInfo>
          Page {page} of {totalPages}
        </PageInfo>
        <PageButton
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => dispatch({ type: "setPage", page: page + 1 })}
        >
          Next →
        </PageButton>
      </Pager>
    </Panel>
  );
}
