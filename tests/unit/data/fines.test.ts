import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FINES_STAGING_COLUMNS,
  contentSha1,
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
  min_amount: 0,
  max_amount: 1000,
  first_violation_amount: null,
  second_violation_amount: null,
  subsequent_violation_amount: null,
  effective_min: 0,
  effective_max: 1000,
  per_day_violation: true,
  jail_mentioned: false,
  penalty_nature: "civil",
  extraction_flag: null,
  grounded: true,
};

test("contentSha1 matches the supplement fingerprint", () => {
  assert.equal(contentSha1(""), "da39a3ee5e6b4b0d");
  assert.equal(contentSha1("abc"), "a9993e364706816a");
  assert.equal(contentSha1("§ 1-8 café"), "8b03fa7f2b687c99");
});

test("only rows the model read are stored", () => {
  assert.equal(isModelAnnotated(PENALTY_ROW), true);
  assert.equal(isModelAnnotated(KINGCOVE), false);
  assert.equal(isModelAnnotated({ annotation_source: null }), false);
});

test("staging COPY keeps nulls, a zero amount, and a tab inside a header", () => {
  const line = encodeStagingRow({
    ...PENALTY_ROW,
    header: "## 1.15.025\tCivil remedies",
  });
  const fields = line.slice(0, -1).split("\t");
  const at = (name: (typeof FINES_STAGING_COLUMNS)[number]) =>
    fields[FINES_STAGING_COLUMNS.indexOf(name)];
  assert.equal(fields.length, FINES_STAGING_COLUMNS.length);
  assert.equal(at("county"), "");
  assert.equal(at("min_amount"), "0");
  assert.equal(at("fixed_amount"), "\\N");
  assert.equal(at("header"), "## 1.15.025\\tCivil remedies");
  assert.equal(at("grounded"), "t");

  const unread = encodeStagingRow(KINGCOVE).slice(0, -1).split("\t");
  assert.equal(
    unread[FINES_STAGING_COLUMNS.indexOf("grounded")],
    "\\N",
  );
  assert.equal(unread.length, FINES_STAGING_COLUMNS.length);
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

test("fines render as dollars, a share of sections read, and a hover line", () => {
  assert.equal(formatFine(500), "$500");
  assert.equal(formatFine(37.5), "$37.50");
  assert.equal(formatFine(0), "$0");
  assert.equal(amountShare(stats({ penaltySections: 200, amountSections: 50 })), 0.25);
  assert.equal(amountShare(stats({ penaltySections: 0, amountSections: 0 })), null);
  assert.equal(amountShare(null), null);
  assert.equal(fineHoverLine(stats()), "12% state a fine · typical $500");
  assert.equal(fineHoverLine(stats({ medianFine: null })), "12% state a fine");
  for (const value of [null, undefined, stats({ penaltySections: 0 })]) {
    assert.equal(fineHoverLine(value), "not annotated");
  }
});
