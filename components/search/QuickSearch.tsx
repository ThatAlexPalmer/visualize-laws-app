"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useExplorer } from "@/lib/store";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import {
  MIN_PLACE_ZOOM_CHARS,
  resolveQueryFocus,
  type PlaceFocus,
} from "@/components/jurisdiction/placeLookup";

const Positioner = styled.div`
  position: absolute;
  right: ${({ theme }) => theme.space(5)};
  bottom: ${({ theme }) => theme.space(5)};
  z-index: 5;
  width: clamp(260px, 24vw, 340px);

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    position: relative;
    right: auto;
    bottom: auto;
    width: 100%;
    padding: ${({ theme }) => theme.space(3)};
    border-bottom: 1px solid ${({ theme }) => theme.colors.g08};
    background: ${({ theme }) => theme.colors.bg};
  }
`;

const Form = styled.form`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 46px;
  border: 1px solid ${({ theme }) => theme.colors.g20};
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(0, 0, 0, 0.9);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(12px);
  transition: border-color ${({ theme }) => theme.motion.fast}s ease;

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.g68};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.lg}) {
    min-height: 48px;
    box-shadow: none;
    background: ${({ theme }) => theme.colors.g04};
  }
`;

const Label = styled.label`
  flex-shrink: 0;
  padding-left: ${({ theme }) => theme.space(3)};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.colors.g76};
  text-transform: uppercase;

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
`;

const SearchInput = styled.input`
  min-width: 0;
  flex: 1;
  height: 44px;
  padding: 0 ${({ theme }) => theme.space(9)} 0 ${({ theme }) => theme.space(3)};
  border: 0;
  outline: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.fg};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.fontSize.md};

  &::placeholder {
    color: ${({ theme }) => theme.colors.g60};
  }

  &::-webkit-search-cancel-button {
    appearance: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.xs}) {
    padding-left: ${({ theme }) => theme.space(3)};
  }
`;

const Clear = styled.button`
  position: absolute;
  right: ${({ theme }) => theme.space(2)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: transparent;
  color: ${({ theme }) => theme.colors.g76};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.md};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.fg};
    background: ${({ theme }) => theme.colors.g08};
  }
`;

export function QuickSearch() {
  const { state, dispatch } = useExplorer();
  const [query, setQuery] = useState(state.filters.q ?? "");
  const selectedStateRef = useRef(state.selectedState);
  selectedStateRef.current = state.selectedState;
  const lookupAbort = useRef<AbortController | null>(null);

  const applyFocus = (focus: PlaceFocus): void => {
    dispatch({ type: "selectFocus", focus });
  };

  const applyQuery = async (
    value: string,
    uniqueOnly: boolean,
  ): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) {
      dispatch({ type: "patchFilters", filters: { q: undefined } });
      return;
    }
    if (uniqueOnly && trimmed.length < MIN_PLACE_ZOOM_CHARS) {
      dispatch({ type: "patchFilters", filters: { q: trimmed } });
      return;
    }

    lookupAbort.current?.abort();
    const ac = new AbortController();
    lookupAbort.current = ac;
    try {
      const focus = await resolveQueryFocus(trimmed, {
        currentState: selectedStateRef.current,
        uniqueOnly,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (focus?.kind === "state") {
        applyFocus(focus);
        dispatch({ type: "patchFilters", filters: { q: undefined } });
        return;
      }
      dispatch({ type: "patchFilters", filters: { q: trimmed } });
      if (focus) applyFocus(focus);
    } catch {
      dispatch({ type: "patchFilters", filters: { q: trimmed } });
    }
  };

  const debounced = useDebouncedCallback((value: string) => {
    void applyQuery(value, true);
  }, 300);

  useEffect(() => {
    debounced.cancel();
    setQuery(state.filters.q ?? "");
    // filterResetVersion intentionally cancels a pending query even if q was
    // already undefined when Reset was pressed.
  }, [state.filters.q, state.filterResetVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    debounced.cancel();
    lookupAbort.current?.abort();
    setQuery("");
    dispatch({ type: "patchFilters", filters: { q: undefined } });
  };

  return (
    <Positioner>
      <Form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          debounced.cancel();
          void applyQuery(query, false);
        }}
      >
        <Label htmlFor="law-search">Search</Label>
        <SearchInput
          id="law-search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Law text or phrase…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            debounced.run(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              clear();
            }
          }}
        />
        {query && (
          <Clear type="button" aria-label="Clear search" onClick={clear}>
            ×
          </Clear>
        )}
      </Form>
    </Positioner>
  );
}
