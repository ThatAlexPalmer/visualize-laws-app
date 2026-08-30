// Funny mode copy — replaces normal axis labels/blurbs and static UI strings
// when `state.unhinged` is true. Generated with Grok assistance.
import type { Axis } from "@/lib/types";
import { AXIS_BY_KEY } from "@/lib/types";

/** Funny axis labels + blurbs shown in funny mode. */
export const UNHINGED_AXES: Record<Axis, { label: string; blurb: string }> = {
  opacity: {
    label: "HUH? FACTOR",
    blurb: "Legal text that reads like a terms of service nobody agreed to.",
  },
  enforcementDiscretion: {
    label: "WIGGLE ROOM",
    blurb: "How much the officer can just... decide.",
  },
  paternalism: {
    label: "NANNY INDEX",
    blurb: "Your government wanted to be your mom.",
  },
  problemSalience: {
    label: "ACTUALLY MATTERS",
    blurb: "Was there even a problem, or did someone just get annoyed once?",
  },
};

/** Fines layer label + legend blurb. Not an axis. */
export const FINES_COPY = {
  label: "Fines",
  blurb: "How often this place's code states a dollar fine.",
} as const;

/** Static UI string replacements. Key = the normal string. */
export const UNHINGED_UI: Record<string, string> = {
  "Search & Filters": "FIND YOUR OPPRESSOR",
  "Reset": "FORGET EVERYTHING",
  "Scores": "VIBES",
  "Fines": "THE BILL",
  "Typical fine": "The usual sting",
  "State a fine": "Named a price",
  "Any type": "WHATEVER HURTS",
  "These only include laws checked for a stated fine, so the list gets shorter.":
    "Only the priced ones. The rest we never opened.",
  "Substantive": "ACTUAL LAWS",
  "Procedural": "RED TAPE",
  "Any function": "WHO KNOWS",
  "Any topic": "LITERALLY ANYTHING",
  "Select a state on the map to see its profile.":
    "Pick a state. Any state. They all did something.",
  "Average scores": "Mean vibes",
  "Notable laws": "Hall of fame (or shame)",
  "Cities": "Towns that did this",
  "No laws match these filters.": "None of your business, apparently.",
  "Loading\u2026": "summoning chaos\u2026",
  "About": "WHAT IS THIS",
  "log": "receipts",
  "Release log": "The tape",
  "What you can do in each version.":
    "What we let you do, version by version.",
  "← back to the map": "← back to the legal panic",
  "GitHub release": "The tag",
};

/** Return the label + blurb for an axis, respecting unhinged mode. */
export function resolveAxisCopy(
  axis: Axis,
  unhinged: boolean,
): { label: string; blurb: string } {
  if (unhinged) return UNHINGED_AXES[axis];
  const a = AXIS_BY_KEY[axis];
  return { label: a.label, blurb: a.blurb };
}

/** Fines layer copy. Funny mode gets THE BILL. */
export function resolveFinesCopy(unhinged: boolean): {
  label: string;
  blurb: string;
} {
  if (unhinged) {
    return {
      label: "THE BILL",
      blurb: "How often they actually named a price.",
    };
  }
  return { label: FINES_COPY.label, blurb: FINES_COPY.blurb };
}

/** Return a static UI string, falling back to the key if no mapping exists. */
export function ui(key: string, unhinged: boolean): string {
  if (!unhinged) return key;
  return UNHINGED_UI[key] ?? key;
}
