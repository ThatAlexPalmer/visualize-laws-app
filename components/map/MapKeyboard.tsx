"use client";

import { useState } from "react";
import styled from "styled-components";
import { useExplorer } from "@/lib/store";
import { AXIS_BY_KEY, STATE_NAMES, fineHoverLine, prettySlug } from "@/lib/types";
import { Button } from "@/components/ui/buttons";
import { Select } from "@/components/ui/forms";
import { useMapView } from "./MapViewProvider";
import { axisValue } from "./color";
import type { CountyFillPaint } from "./counties";
import type { CountyPathEntry, Hovered } from "./draw";

const Browse = styled.details`
  position: absolute;
  bottom: ${({ theme }) => theme.space(3)};
  left: ${({ theme }) => theme.space(3)};
  z-index: 4;
  max-width: min(300px, calc(100% - 24px));
  max-height: 65%;
  overflow: auto;
  padding: ${({ theme }) => theme.space(2)};
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.g20};
  color: ${({ theme }) => theme.colors.fg};
  font-size: ${({ theme }) => theme.fontSize.sm};
  summary { cursor: pointer; }
  label { display: block; margin-top: ${({ theme }) => theme.space(2)}; }
`;

/** Keyboard equivalent of the baked map, including unscored county inspection. */
export function MapKeyboard({ counties, paints, onInspect }: {
  counties: CountyPathEntry[];
  paints: Map<string, CountyFillPaint>;
  onInspect: (hovered: Hovered | null) => void;
}) {
  const { state, dispatch } = useExplorer();
  const { fillByKey, aggByUsps } = useMapView();
  const [countyId, setCountyId] = useState("");
  const available = counties.filter((c) => c.usps === state.selectedState)
    .sort((a, b) => a.name.localeCompare(b.name));
  const county = available.find((c) => c.fips === countyId);
  const paint = county ? paints.get(county.fips) : undefined;
  const aggregate = county
    ? paint && fillByKey.get(`${paint.source}:${paint.sourcePlace}`)
    : state.selectedState ? aggByUsps.get(state.selectedState) : undefined;
  return (
    <Browse>
      <summary>Browse map by keyboard</summary>
      <label>
        Map state
        <Select aria-label="Map state" value={state.selectedState ?? ""} onChange={(event) => {
          setCountyId("");
          onInspect(null);
          dispatch({ type: "selectState", state: event.target.value || null });
        }}>
          <option value="">United States</option>
          {Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]))
            .map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </Select>
      </label>
      {state.selectedState && (
        <label>
          Inspect county
          <Select aria-label="Inspect county" value={county?.fips ?? ""} onChange={(event) => {
            const next = available.find((c) => c.fips === event.target.value);
            setCountyId(event.target.value);
            const fill = next && paints.get(next.fips);
            onInspect(next ? {
              kind: "county", usps: next.usps, countyName: next.name,
              countySlug: fill?.countySlug, fillSource: fill?.source,
              sourcePlace: fill?.sourcePlace,
            } : null);
          }}>
            <option value="">State summary</option>
            {available.map((c) => <option key={c.fips} value={c.fips}>{c.name}</option>)}
          </Select>
        </label>
      )}
      <p aria-live="polite">
        {paint?.source === "city" && `${prettySlug(paint.sourcePlace)} code · `}
        {aggregate ? `${AXIS_BY_KEY[state.axis].label}: ${axisValue(aggregate, state.axis).toFixed(2)} · ${fineHoverLine(aggregate.penalties)}` :
          county ? "No score data · not annotated" : "Select a state to inspect its map data."}
      </p>
      {paint && state.selectedState && (
        <Button type="button" onClick={() => dispatch({
          type: "selectFocus",
          focus: paint.source === "city"
            ? { kind: "city", state: state.selectedState!, city: paint.sourcePlace }
            : { kind: "county", state: state.selectedState!, county: paint.countySlug ?? paint.sourcePlace },
        })}>Select this code</Button>
      )}
    </Browse>
  );
}
