// Shared types and constants — the contract every feature module builds against.

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
  county?: string;
  function?: string;
  topic?: string;
  isSubstantive?: boolean;
  opacity?: ScoreRange;
  enforcementDiscretion?: ScoreRange;
  paternalism?: ScoreRange;
  problemSalience?: ScoreRange;
  page: number;
  pageSize: number;
  sort?: { axis: Axis; dir: "asc" | "desc" } | null;
}

export interface LawRecord {
  id: number;
  header: string | null;
  content: string;
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
}

export interface LawsResponse {
  rows: LawRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JurisdictionAgg {
  level: string;
  state: string | null;
  county: string | null;
  name: string;
  lawCount: number;
  substantiveCount: number;
  avgOpacity: number;
  avgEnforcementDiscretion: number;
  avgPaternalism: number;
  avgProblemSalience: number;
}

export type AxisBounds = Record<Axis, [number, number]>;

export interface JurisdictionsResponse {
  rows: JurisdictionAgg[];
  national: (JurisdictionAgg & { bounds?: AxisBounds }) | null;
}

export interface JurisdictionDetailResponse {
  jurisdiction: JurisdictionAgg | null;
  topLaws: LawRecord[];
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
