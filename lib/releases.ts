import { REPOSITORY_URL } from "./attribution";

export interface AppRelease {
  version: string;
  /** Calendar date the GitHub release was published (YYYY-MM-DD). */
  released: string;
  notes: readonly [string, string, string];
  href: string;
}

function githubRelease(tag: string): string {
  return `${REPOSITORY_URL}/releases/tag/${tag}`;
}

/** Newest first. Three bullets, each what the user can do — not internals. */
export const RELEASES: readonly AppRelease[] = [
  {
    version: "1.1.1",
    released: "2026-08-24",
    href: githubRelease("v1.1.1"),
    notes: [
      "Type a state name (colorado) and go to that state, not a city that shares the name.",
      "See that state’s full law list, not only laws that mention the word.",
      "Read law titles and bodies as formatted text — headings and tables, not raw marks.",
    ],
  },
  {
    version: "1.1.0",
    released: "2026-08-23",
    href: githubRelease("v1.1.0"),
    notes: [
      "Zoom a state and see counties colored from a city’s code when that city sits in only one county.",
      "Hover those counties to see they are the city’s code, not county law.",
      "Houston, Dallas, and Austin stay empty — they span more than one county.",
    ],
  },
  {
    version: "1.0.0",
    released: "2026-07-19",
    href: githubRelease("v1.0.0"),
    notes: [
      "Search and filter 2.2 million U.S. local laws.",
      "Color the map by how a rule reads, how much discretion it leaves, and how serious the problem is.",
      "Open a state for its profile, notable laws, and the full results list.",
    ],
  },
];
