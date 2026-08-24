import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cityMatchKeys,
  matchLocusCities,
  parseCountyFile,
  parsePlaceFile,
  stripPlaceLegalSuffix,
} from "./cityCounty";

const PLACE_TXT = [
  "STATE|STATEFP|PLACEFP|PLACENS|PLACENAME|TYPE|CLASSFP|FUNCSTAT|COUNTIES",
  "TX|48|35000|00000000|Houston city|INCORPORATED PLACE|C1|A|Fort Bend County~~~Harris County~~~Montgomery County",
  "TX|48|58016|00000000|Plano city|INCORPORATED PLACE|C1|A|Collin County",
  "TX|48|05000|00000000|Austin city|INCORPORATED PLACE|C1|A|Bastrop County~~~Hays County~~~Travis County",
  "TX|48|19000|00000000|Dallas city|INCORPORATED PLACE|C1|A|Dallas County~~~Denton County",
  "MN|27|58000|00000000|St. Paul city|INCORPORATED PLACE|C1|A|Ramsey County",
  "HI|15|71550|00000000|Urban Honolulu CDP|CENSUS DESIGNATED PLACE|U1|S|Honolulu County",
  "OH|39|18000|00000000|Columbus city|INCORPORATED PLACE|C1|A|Delaware County~~~Franklin County",
  "GA|13|04000|00000000|Atlanta city|INCORPORATED PLACE|C1|A|DeKalb County~~~Fulton County",
].join("\n");

const COUNTY_TXT = [
  "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT",
  "TX|48|085|00000000|Collin County|H1|A",
  "TX|48|201|00000000|Harris County|H1|A",
  "TX|48|157|00000000|Fort Bend County|H1|A",
  "TX|48|339|00000000|Montgomery County|H1|A",
  "MN|27|123|00000000|Ramsey County|H1|A",
  "HI|15|003|00000000|Honolulu County|H1|A",
].join("\n");

test("cityMatchKeys: saint/ste, hyphen, concat", () => {
  assert.deepEqual(cityMatchKeys("Saint Paul"), {
    underscore: "st_paul",
    concat: "stpaul",
  });
  assert.deepEqual(cityMatchKeys("saint_paul"), {
    underscore: "st_paul",
    concat: "stpaul",
  });
  assert.deepEqual(cityMatchKeys("pagosa-springs"), {
    underscore: "pagosa_springs",
    concat: "pagosasprings",
  });
});

test("stripPlaceLegalSuffix strips one Census legal suffix", () => {
  assert.equal(stripPlaceLegalSuffix("Houston city"), "Houston");
  assert.equal(stripPlaceLegalSuffix("Urban Honolulu CDP"), "Urban Honolulu");
  assert.equal(stripPlaceLegalSuffix("Pagosa Springs town"), "Pagosa Springs");
});

test("one-county city gets FIPS; multi-county is flagged", () => {
  const matches = matchLocusCities(
    [
      { state: "tx", city: "plano" },
      { state: "tx", city: "houston" },
      { state: "tx", city: "dallas" },
      { state: "tx", city: "austin" },
      { state: "oh", city: "columbus" },
      { state: "ga", city: "atlanta" },
      { state: "mn", city: "saint_paul" },
      { state: "hi", city: "honolulu" },
    ],
    parsePlaceFile(PLACE_TXT),
    parseCountyFile(COUNTY_TXT),
  );
  const byCity = Object.fromEntries(matches.map((m) => [m.city, m]));

  assert.equal(byCity.plano.matchRule, "exact");
  assert.equal(byCity.plano.multiCounty, false);
  assert.equal(byCity.plano.countyFips, "48085");
  assert.equal(byCity.plano.countyName, "Collin County");

  for (const slug of ["houston", "dallas", "austin", "columbus", "atlanta"]) {
    assert.equal(byCity[slug].matchRule, "multi");
    assert.equal(byCity[slug].multiCounty, true);
    assert.equal(byCity[slug].countyFips, null);
  }

  assert.equal(byCity.saint_paul.matchRule, "exact");
  assert.equal(byCity.saint_paul.countyFips, "27123");

  assert.equal(byCity.honolulu.matchRule, "unmatched");
  assert.equal(byCity.honolulu.countyFips, null);
});

test("concatenated LOCUS slug still matches a spaced Census place", () => {
  const placeTxt = [
    "STATE|STATEFP|PLACEFP|PLACENS|PLACENAME|TYPE|CLASSFP|FUNCSTAT|COUNTIES",
    "CO|08|56860|00000000|Pagosa Springs town|INCORPORATED PLACE|C1|A|Archuleta County",
  ].join("\n");
  const countyTxt = [
    "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT",
    "CO|08|007|00000000|Archuleta County|H1|A",
  ].join("\n");
  const [row] = matchLocusCities(
    [{ state: "co", city: "pagosasprings" }],
    parsePlaceFile(placeTxt),
    parseCountyFile(countyTxt),
  );
  assert.equal(row?.matchRule, "concat");
  assert.equal(row?.countyFips, "08007");
  assert.equal(row?.multiCounty, false);
});
