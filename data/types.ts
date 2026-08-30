// Shared types and constants — the contract every feature module builds against.
import { prettySlug } from "./slugs";

/** The four LOCUS scoring axes (camelCase keys used across the app). */
export type Axis =
  | "opacity"
  | "enforcementDiscretion"
  | "paternalism"
  | "problemSalience";

export interface AxisMeta {
  key: Axis;
  /** Human label for UI. */
  label: string;
  /** Postgres column name (snake_case) for raw SQL. */
  column: string;
  /** Short description shown in tooltips / legend. */
  blurb: string;
}

export const AXES: AxisMeta[] = [
  { key: "opacity", label: "Opacity", column: "opacity", blurb: "How hard the text is to read/understand." },
  { key: "enforcementDiscretion", label: "Enforcement Discretion", column: "enforcement_discretion", blurb: "Latitude granted to enforcers." },
  { key: "paternalism", label: "Paternalism", column: "paternalism", blurb: "Degree the rule restricts personal choice." },
  { key: "problemSalience", label: "Problem Salience", column: "problem_salience", blurb: "How pressing the underlying problem is." },
];

export const AXIS_BY_KEY: Record<Axis, AxisMeta> = Object.fromEntries(
  AXES.map((a) => [a.key, a]),
) as Record<Axis, AxisMeta>;

/** LOCUS-v1 categorical label vocabularies. */
export const FUNCTIONS = ["Context", "Rules", "Process", "Enforcement", "Structural"] as const;
export const TOPICS = ["Buildings", "Business", "Nuisance", "Zoning", "Other"] as const;
export type FunctionLabel = (typeof FUNCTIONS)[number];
export type TopicLabel = (typeof TOPICS)[number];

export interface ScoreRange {
  min: number;
  max: number;
}

/** Default slider domain for the z-scored axes (overridden by DatasetStat bounds). */
export const DEFAULT_SCORE_RANGE: ScoreRange = { min: -4, max: 4 };

export interface LawFilters {
  q?: string;
  state?: string;
  city?: string;
  county?: string;
  function?: string;
  topic?: string;
  isSubstantive?: boolean;
  opacity?: ScoreRange;
  enforcementDiscretion?: ScoreRange;
  paternalism?: ScoreRange;
  problemSalience?: ScoreRange;
  // LOCUS-Fines filters. These narrow to laws the supplement's model read;
  // a law with no annotation is excluded, which is not the same as it having
  // no penalty.
  hasFine?: boolean;
  fineMin?: number;
  fineMax?: number;
  perDay?: boolean;
  jail?: boolean;
  penaltyNature?: PenaltyNature;
  page: number;
  pageSize: number;
  sort?: { key: SortKey; dir: "asc" | "desc" } | null;
}

/**
 * What the results list is ordered by. The four axes plus the stated fine —
 * sorting by `fine` implies the law states one, since there is nothing to rank
 * otherwise.
 */
export type SortKey = Axis | "fine";
export const FINE_SORT_KEY = "fine" as const;

export function isSortKey(value: string): value is SortKey {
  return value === FINE_SORT_KEY || value in AXIS_BY_KEY;
}

/** `penalty_nature` vocabulary. Whitelisted before it reaches SQL. */
export const PENALTY_NATURES = ["criminal", "civil", "both"] as const;
export type PenaltyNature = (typeof PENALTY_NATURES)[number];

export function isPenaltyNature(value: string): value is PenaltyNature {
  return (PENALTY_NATURES as readonly string[]).includes(value);
}

/**
 * LOCUS-Fines annotation for one law. Present only when the supplement's model
 * actually read the law — **absent means "not annotated", never "no penalty"**.
 * Amounts are verified against the source text; the categorical fields are not,
 * so treat `grounded === false` and a non-null `extractionFlag` as caveats.
 */
export interface LawFines {
  fineRelevant: boolean;
  penaltyScope: string | null;
  penaltyStated: string | null;
  fineStructure: string | null;
  fixedAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  firstViolationAmount: number | null;
  secondViolationAmount: number | null;
  subsequentViolationAmount: number | null;
  /** min / max across all six amount fields — the section's true penalty span. */
  effectiveMin: number | null;
  effectiveMax: number | null;
  perDayViolation: boolean;
  jailMentioned: boolean;
  penaltyNature: string | null;
  extractionFlag: string | null;
  grounded: boolean | null;
}

export interface LawSummary {
  id: number;
  header: string | null;
  isSubstantive: boolean;
  function: string | null;
  topic: string | null;
  sourceJurisdictionType: string | null;
  state: string;
  city: string | null;
  county: string | null;
  opacity: number;
  enforcementDiscretion: number;
  paternalism: number;
  problemSalience: number;
  /**
   * The stated fine, when the supplement's model read this law and found one.
   * Carried on the list row so fines stay visible on every layer, not only
   * when the Fines layer is selected.
   */
  fine?: number | null;
}

export interface LawRecord extends LawSummary {
  content: string;
}

export interface LawsResponse {
  rows: LawSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AxisAverages {
  avgOpacity: number;
  avgEnforcementDiscretion: number;
  avgPaternalism: number;
  avgProblemSalience: number;
}

/**
 * Per-place LOCUS-Fines aggregate (the `place_penalties` table).
 *
 * Deliberately **not** folded into `AxisAverages`: the four axes are z-scored
 * per-law scores present on every law, whereas these are counts over the
 * subset of sections the supplement's model read.
 */
export interface PenaltyStats {
  /** Sections the model read for this place — the denominator for every share. */
  penaltySections: number;
  /** Of those, how many state a dollar amount. */
  amountSections: number;
  jailSections: number;
  perDaySections: number;
  /** null when too few amount sections back it to be meaningful. */
  medianFine: number | null;
  /**
   * Average problem salience among read sections that name an amount, and
   * among those that do not. Both sides come from inside the read set, so the
   * gap between them is a real signal rather than a sampling artifact:
   * corpus-wide it is +1.17 against +0.36. Null when the sample is too thin.
   */
  salienceAmount: number | null;
  salienceNoAmount: number | null;
}

/**
 * Below this many amount-bearing sections a median is noise, so it is not
 * computed. 41 of 2,287 places fall under it.
 */
export const PENALTY_MEDIAN_MIN = 5;

/**
 * The penalties choropleth value: share of read sections stating a dollar
 * amount, 0..1. Null when the place was never annotated — which the UI must
 * render as "not annotated", never as "no penalty".
 *
 * The denominator is model-read sections, never all laws: measured across
 * states, this share is uncorrelated with how much of a state the model read
 * (r = 0.11), while dividing by all laws is not (r = 0.46).
 */
export function amountShare(stats: PenaltyStats | null | undefined): number | null {
  if (!stats || stats.penaltySections <= 0) return null;
  return stats.amountSections / stats.penaltySections;
}

/** What the choropleth is currently encoding. Not an `Axis`. */
export type MapLayer = "scores" | "penalties";

/** `$500`, `$37.50`, `$5,000,000` — cents only when the amount has them. */
export function formatFine(amount: number): string {
  const fractional = !Number.isInteger(amount);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: fractional ? 2 : 0,
  });
}

/** A 0..1 share as a whole percentage. */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * The stated penalty as a phrase — `$500`, `$50 – $1,000`, `up to $2,500` —
 * or null when the section states no amount of its own.
 */
export function penaltyAmountLabel(fines: LawFines): string | null {
  if (fines.fixedAmount !== null) return formatFine(fines.fixedAmount);

  const { effectiveMin: lo, effectiveMax: hi } = fines;
  if (lo !== null && hi !== null) {
    return lo === hi ? formatFine(lo) : `${formatFine(lo)} – ${formatFine(hi)}`;
  }
  if (hi !== null) return `up to ${formatFine(hi)}`;
  if (lo !== null) return `at least ${formatFine(lo)}`;
  return null;
}

/**
 * Why a read section carries no amount. Keeps "checked, no figure" distinct
 * from "nobody looked", which is an absent annotation.
 */
export function penaltyAbsenceLabel(fines: LawFines): string {
  switch (fines.penaltyStated) {
    case "cross_reference":
      return "Points to a fine set elsewhere in the code.";
    case "implicit":
      return "Prohibits conduct without stating a fine.";
    default:
      return "States no fine of its own.";
  }
}

/**
 * The second hover line on the Fines layer: what the colour actually means for
 * this place, in plain words.
 *
 * Deliberately short and sentence-case — it renders under the place name, not
 * inside it. Returns null when there is nothing to say. Does not mention how
 * many sections were read: that is provenance, not a hover fact.
 *
 * A place nobody checked reads "not annotated", never "no fines".
 */
export function fineHoverLine(
  stats: PenaltyStats | null | undefined,
): string | null {
  if (!stats || stats.penaltySections === 0) return "not annotated";

  const share = formatShare(stats.amountSections / stats.penaltySections);
  const typical =
    stats.medianFine === null
      ? null
      : `typical ${formatFine(stats.medianFine)}`;

  return [`${share} state a fine`, typical].filter(Boolean).join(" · ");
}

/**
 * Caveat copy when the annotation is shaky, or null when it is ordinary.
 * Amounts are checked against the source text but the categorical judgements
 * are not, so these rows are surfaced with a warning rather than hidden.
 */
export function penaltyCaveat(fines: LawFines): string | null {
  if (fines.grounded === false) {
    return "An amount here could not be found in the section text and was removed.";
  }
  switch (fines.extractionFlag) {
    case "fragment_incomplete":
      return "Read from an incomplete fragment of the section.";
    case "table_fragment":
      return "Read from a table fragment.";
    case "not_ordinance_text":
      return "This text may not be ordinance text.";
    default:
      return null;
  }
}

export interface JurisdictionAgg extends AxisAverages {
  level: string;
  state: string | null;
  county: string | null;
  name: string;
  lawCount: number;
  substantiveCount: number;
  /** null when the supplement's model read nothing for this place. */
  penalties?: PenaltyStats | null;
}

export type CountyFillSource = "county" | "city";

/** Map-layer row: a native county score or a one-county city stand-in. */
export interface CountyFill extends AxisAverages {
  state: string;
  fips: string | null;
  source: CountyFillSource;
  sourcePlace: string;
  county: string | null;
  name: string;
  lawCount: number;
  substantiveCount: number;
  penalties?: PenaltyStats | null;
}

export type AxisBounds = Record<Axis, [number, number]>;

export interface JurisdictionsResponse {
  rows: JurisdictionAgg[];
  national: (JurisdictionAgg & { bounds?: AxisBounds }) | null;
}

/** True when the US map payload is safe to cache (never `national: null` / empty). */
export function isCompleteNational(body: JurisdictionsResponse): boolean {
  return body.national !== null && body.rows.length > 0;
}

export interface PlaceMatch {
  state: string;
  city?: string | null;
  county?: string | null;
  name: string;
  lawCount: number;
}

export interface PlaceLookupResponse {
  places: PlaceMatch[];
}

export interface CityAgg {
  city: string;
  lawCount: number;
}

export interface JurisdictionDetailResponse {
  jurisdiction: JurisdictionAgg | null;
  topLaws: LawSummary[];
  counties: JurisdictionAgg[];
  countyFills: CountyFill[];
  topCities: CityAgg[];
}

export function nativeCountyToFill(row: JurisdictionAgg): CountyFill {
  return {
    state: row.state ?? "",
    fips: null,
    source: "county",
    sourcePlace: row.county ?? "",
    county: row.county,
    name: row.name,
    lawCount: row.lawCount,
    substantiveCount: row.substantiveCount,
    avgOpacity: row.avgOpacity,
    avgEnforcementDiscretion: row.avgEnforcementDiscretion,
    avgPaternalism: row.avgPaternalism,
    avgProblemSalience: row.avgProblemSalience,
    penalties: row.penalties ?? null,
  };
}

/** Hover / chip copy for a city stand-in. Not “county law.” */
export function cityStandInLabel(
  countyName: string,
  citySlug: string,
): string {
  return `${countyName} · ${prettySlug(citySlug)} code`;
}

export interface LawDetailResponse {
  law: LawRecord;
  /** null when the supplement's model never read this law. */
  fines?: LawFines | null;
}

export interface ApiErrorResponse {
  error: string;
}

/** Lowercase 2-letter state code -> display name (matches LOCUS `state` values). */
export const STATE_NAMES: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California",
  co: "Colorado", ct: "Connecticut", de: "Delaware", dc: "District of Columbia",
  fl: "Florida", ga: "Georgia", hi: "Hawaii", id: "Idaho", il: "Illinois",
  in: "Indiana", ia: "Iowa", ks: "Kansas", ky: "Kentucky", la: "Louisiana",
  me: "Maine", md: "Maryland", ma: "Massachusetts", mi: "Michigan", mn: "Minnesota",
  ms: "Mississippi", mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada",
  nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico", ny: "New York",
  nc: "North Carolina", nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon",
  pa: "Pennsylvania", ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota",
  tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia",
  wa: "Washington", wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming",
  pr: "Puerto Rico", gu: "Guam", vi: "U.S. Virgin Islands", as: "American Samoa",
  mp: "Northern Mariana Islands",
};

export function stateName(code: string | null | undefined): string {
  if (!code) return "—";
  return STATE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

export {
  isCountyKindSlug,
  matchCountySlug,
  normalizePlaceKey,
  prettySlug,
  slugVariants,
} from "./slugs";
