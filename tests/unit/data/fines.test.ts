import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FINES_STAGING_COLUMNS,
  encodeStagingRow,
  isModelAnnotated,
  type RawFineRow,
} from "@/data/fines";
import {
  amountShare,
  fineHoverLine,
  formatFine,
  type PenaltyStats,
} from "@/data/types";

const KINGCOVE: RawFineRow = {
  state: "ak",
  source_jurisdiction_type: "cities",
  city: "kingcove",
  county: null,
  function: "Context",
  header: "### 1.05.010 Name of municipality--Form of government.",
  content_sha1: "4fce7cb536997fcc",
  annotation_source: "unchanged_LOCUS",
  fine_relevant: false,
  per_day_violation: false,
  jail_mentioned: false,
  grounded: null,
};

const PENALTY_ROW: RawFineRow = {
  state: "ak",
  source_jurisdiction_type: "cities",
  city: "kingcove",
  county: null,
  function: "Enforcement",
  header: "## 1.15.025 Civil remedies, penalties and injunctions.",
  content_sha1: "4b006d0c042a0ddb",
  annotation_source: "LLM",
  fine_relevant: true,
  penalty_scope: "code_general",
  penalty_stated: "amounts_here",
  fine_structure: "fluid",
  fixed_amount: null,
  min_amount: 50,
  max_amount: 1000,
  first_violation_amount: null,
  second_violation_amount: null,
  subsequent_violation_amount: null,
  effective_min: 50,
  effective_max: 1000,
  per_day_violation: true,
  jail_mentioned: false,
  penalty_nature: "civil",
  extraction_flag: null,
  grounded: true,
};

function fieldsOf(row: RawFineRow): string[] {
  const line = encodeStagingRow(row);
  assert.ok(line.endsWith("\n"));
  return line.slice(0, -1).split("\t");
}

function at(fields: string[], name: (typeof FINES_STAGING_COLUMNS)[number]): string {
  return fields[FINES_STAGING_COLUMNS.indexOf(name)];
}

test("isModelAnnotated keeps only rows the model read", () => {
  assert.equal(isModelAnnotated(PENALTY_ROW), true);
  assert.equal(isModelAnnotated(KINGCOVE), false);
  assert.equal(isModelAnnotated({ annotation_source: null }), false);
});

test("encodeStagingRow writes one COPY field per column", () => {
  const fields = fieldsOf(PENALTY_ROW);
  assert.equal(fields.length, FINES_STAGING_COLUMNS.length);
  assert.equal(at(fields, "state"), "ak");
  assert.equal(at(fields, "city"), "kingcove");
  assert.equal(at(fields, "county"), "");
  assert.equal(at(fields, "content_sha1"), "4b006d0c042a0ddb");
  assert.equal(at(fields, "annotation_source"), "LLM");
  assert.equal(at(fields, "fine_relevant"), "t");
  assert.equal(at(fields, "fixed_amount"), "\\N");
  assert.equal(at(fields, "min_amount"), "50");
  assert.equal(at(fields, "effective_max"), "1000");
  assert.equal(at(fields, "per_day_violation"), "t");
  assert.equal(at(fields, "jail_mentioned"), "f");
  assert.equal(at(fields, "penalty_nature"), "civil");
  assert.equal(at(fields, "extraction_flag"), "\\N");
  assert.equal(at(fields, "grounded"), "t");

  const zero = fieldsOf({ ...PENALTY_ROW, min_amount: 0 });
  assert.equal(at(zero, "min_amount"), "0");

  const escaped = fieldsOf({ ...PENALTY_ROW, header: "a\tb\nc\\d" });
  assert.equal(escaped.length, FINES_STAGING_COLUMNS.length);
  assert.equal(at(escaped, "header"), "a\\tb\\nc\\\\d");

  const rule = fieldsOf(KINGCOVE);
  assert.equal(at(rule, "grounded"), "\\N");
  assert.equal(at(rule, "fine_relevant"), "f");
});

test("formatFine shows cents only when the amount has them", () => {
  assert.equal(formatFine(500), "$500");
  assert.equal(formatFine(5_000_000), "$5,000,000");
  assert.equal(formatFine(37.5), "$37.50");
  assert.equal(formatFine(0), "$0");
});

test("amountShare divides by sections read, and is null when nothing was read", () => {
  assert.equal(amountShare(stats({ penaltySections: 200, amountSections: 50 })), 0.25);
  assert.equal(amountShare(stats({ penaltySections: 0, amountSections: 0 })), null);
  assert.equal(amountShare(null), null);
  assert.equal(amountShare(undefined), null);
});

test("fineHoverLine states the share, the typical fine, or that nobody looked", () => {
  const line = fineHoverLine(stats());
  assert.equal(line, "12% state a fine · typical $500");
  assert.ok(!/sections read/i.test(line ?? ""));
  assert.ok(!/model/i.test(line ?? ""));

  for (const value of [null, undefined, stats({ penaltySections: 0 })]) {
    const absent = fineHoverLine(value);
    assert.equal(absent, "not annotated");
    assert.ok(!/no fine/i.test(absent ?? ""));
  }

  const thin = fineHoverLine(stats({ medianFine: null }));
  assert.equal(thin, "12% state a fine");
  assert.ok(!thin?.includes("typical"));
});

function stats(over: Partial<PenaltyStats> = {}): PenaltyStats {
  return {
    penaltySections: 47772,
    amountSections: 5738,
    jailSections: 291,
    perDaySections: 4873,
    medianFine: 500,
    salienceAmount: 1.166,
    salienceNoAmount: 0.361,
    ...over,
  };
}
