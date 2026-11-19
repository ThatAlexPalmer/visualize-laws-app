/** Minimum scored counties before the in-state choropleth paints. */
export const COUNTY_FILL_MIN = 8;

export function formatSparseCountyCopy(
  stateLabel: string,
  names: string[],
): { line: string; chipNames: string[] } {
  const n = names.length;
  if (n === 0) {
    return { line: `No county data in ${stateLabel}.`, chipNames: [] };
  }
  if (n === 1) {
    return { line: `County data for ${names[0]} only.`, chipNames: [] };
  }
  if (n === 2) {
    return {
      line: `County data for ${names[0]} and ${names[1]} only.`,
      chipNames: [],
    };
  }
  if (n === 3) {
    return {
      line: `County data for ${names[0]}, ${names[1]}, and ${names[2]} only.`,
      chipNames: [],
    };
  }
  return {
    line: `County data for ${n} counties only.`,
    chipNames: names,
  };
}
