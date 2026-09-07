import { expect, test, type Page } from "@playwright/test";
import type { JurisdictionAgg, LawSummary, LawsResponse } from "../../data/types";
import { geoAlbersUsa } from "d3-geo";
import { feature } from "topojson-client";
import statesTopo from "us-atlas/states-10m.json" with { type: "json" };

// Match the map's fixed 960×600 world without importing its bundler-only JSON loader.
const topology = statesTopo as unknown as Parameters<typeof feature>[0];
const usProjection = geoAlbersUsa().fitExtent(
  [[24, 24], [936, 576]], feature(topology, topology.objects.states),
);

const law: LawSummary = {
  id: 1, header: "Fixture parking law", state: "co", city: null, county: "denver",
  sourceJurisdictionType: "counties", isSubstantive: true, function: "Rules",
  topic: "Transportation", opacity: 1, enforcementDiscretion: 2,
  paternalism: 0, problemSalience: 1,
};
const state: JurisdictionAgg = {
  level: "state", state: "co", county: null, name: "Colorado", lawCount: 12,
  substantiveCount: 12, avgOpacity: 1, avgEnforcementDiscretion: 2,
  avgPaternalism: 0, avgProblemSalience: 1, penalties: null,
};
const county = { ...state, level: "county", county: "denver", name: "Denver" };
const detail = { jurisdiction: state, topLaws: [], counties: [county], topCities: [],
  countyFills: [{ ...county, fips: "08031", source: "county", sourcePlace: "denver" }] };
const results: LawsResponse = {
  rows: [law], total: 12, totalKind: "exact", hasNextPage: true, page: 1, pageSize: 8,
};

async function fixtures(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/jurisdictions") {
      await route.fulfill({ json: { rows: [state],
        national: { ...state, level: "national", state: null, name: "United States" } } });
    } else if (url.pathname.startsWith("/api/jurisdictions/")) {
      await route.fulfill({ json: detail });
    } else if (url.pathname === "/api/laws") {
      await route.fulfill({ json: results });
    } else if (url.pathname === "/api/laws/1") {
      await route.fulfill({ json: { law: { ...law, content: "Fixture law text." }, fines: null } });
    } else {
      await route.fulfill({ json: { places: [] } });
    }
  });
}

test.beforeEach(async ({ page }) => { await fixtures(page); });

async function mapPosition(page: Page, coordinates: [number, number]) {
  const world = usProjection(coordinates)!;
  return page.locator("canvas").first().evaluate((canvas: HTMLCanvasElement, [x, y]) => {
    const transform = canvas.getContext("2d")!.getTransform();
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    return { x: (transform.a * x + transform.e) / dpr,
      y: (transform.d * y + transform.f) / dpr };
  }, world);
}

test("camera waits for county data on repaint and resize, then snaps with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const tracked = window as typeof window & { pathCount: number };
    tracked.pathCount = 0;
    window.Path2D = new Proxy(window.Path2D, {
      construct(target, args) {
        tracked.pathCount++;
        return Reflect.construct(target, args);
      },
    });
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/jurisdictions/co", async (route) => {
    await gate;
    await route.fulfill({ json: detail });
  });
  await page.goto("/");
  const scale = () => page.locator("canvas").first().evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext("2d")!.getTransform().a / devicePixelRatio);
  await expect.poll(scale).toBeGreaterThan(0);
  await page.getByLabel("State", { exact: true }).selectOption("co");
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.getByRole("navigation").getByRole("button", { name: "Paternalism", exact: true }).click();
  await page.waitForTimeout(100);
  // US camera fits the 960x600 world in the map; Colorado zoom is >2x that scale.
  const waitingScale = await scale();
  expect(waitingScale).toBeLessThan(1);
  await expect(page.getByText("Loading counties in Colorado.", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("Loading counties in Colorado.", { exact: true })).toHaveCount(0);
  const focusedScale = await scale();
  expect(focusedScale).toBeGreaterThan(waitingScale * 2);
  await page.waitForTimeout(100);
  expect(await scale()).toBe(focusedScale);
  const pathCount = () => page.evaluate(() =>
    (window as typeof window & { pathCount: number }).pathCount);
  const baked = await pathCount();
  expect(baked).toBeGreaterThan(3000);
  await page.setViewportSize({ width: 1450, height: 1000 });
  await page.getByRole("navigation").getByRole("button", { name: "Opacity", exact: true }).click();
  await page.getByLabel("State", { exact: true }).selectOption("");
  await page.waitForTimeout(100);
  expect(await pathCount()).toBe(baked);
});

test("modal traps focus, makes background inert, closes on Escape and restores focus", async ({ page }) => {
  await page.goto("/");
  const row = page.getByRole("button", { name: /Fixture parking law/ });
  await row.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.locator("#law-search").evaluate((el: HTMLInputElement) => el.focus());
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(row).toBeFocused();
});

test("failed filter refresh cannot display old rows, and retry uses the current key", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Fixture parking law/ })).toBeVisible();
  let failed = true;
  await page.route("**/api/laws?**", async (route) => {
    await route.fulfill(failed ? { status: 503, json: { error: "offline" } } :
      { json: { ...results, rows: [{ ...law, header: "Retried filtered law" }],
        total: 1, hasNextPage: false } });
  });
  await page.getByTitle("Sort by Opacity", { exact: true }).click();
  await expect(page.getByRole("button", { name: /Fixture parking law/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry results" })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry results" }).click();
  await expect(page.getByRole("button", { name: /Retried filtered law/ })).toBeVisible();
});

test("pointer map navigation works without the keyboard browsing panel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Fixture parking law/ })).toBeVisible();
  await expect(page.getByText("Browse map by keyboard", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Map state", { exact: true })).toHaveCount(0);
  const canvas = page.locator("canvas").last();
  const scale = () => page.locator("canvas").first().evaluate((el: HTMLCanvasElement) =>
    el.getContext("2d")!.getTransform().a / devicePixelRatio);
  const usScale = await scale();
  await canvas.click({ position: await mapPosition(page, [-105.5, 39]) });
  await expect(page.getByLabel("State", { exact: true })).toHaveValue("co");
  await expect.poll(scale).toBeGreaterThan(usScale * 2);
  const uncovered = await mapPosition(page, [-104.3, 39.87]);
  await canvas.hover({ position: uncovered });
  await expect(page.getByText("Adams · no data", { exact: true })).toBeVisible();
  await canvas.click({ position: uncovered });
  const countyField = page.getByRole("textbox", { name: "County", exact: true });
  await expect(countyField).toHaveValue("");
  await expect(page.getByLabel("State", { exact: true })).toHaveValue("co");
  await canvas.click({ position: await mapPosition(page, [-104.99, 39.74]) });
  await expect(countyField).toHaveValue("Denver");
  await canvas.click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("State", { exact: true })).toHaveValue("");
  await expect(countyField).toHaveValue("");
});

test("state errors offer a retry on mobile instead of endless loading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failed = true;
  await page.route("**/api/jurisdictions/co", (route) =>
    route.fulfill(failed ? { status: 503, json: { error: "offline" } } : { json: detail }));
  await page.goto("/");
  await expect(page.getByText("Browse map by keyboard", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox").fill("Colorado");
  await page.getByRole("searchbox").press("Enter");
  const retry = page.getByRole("button", { name: /county data unavailable.*retry/ });
  await expect(retry).toBeVisible();
  await expect(page.getByText("Loading counties in Colorado.", { exact: true })).toHaveCount(0);
  failed = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
});

test("clearing an in-flight place lookup does not restore obsolete text or focus", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/places?**", async (route) => {
    await gate;
    await route.fulfill({ json: { places: [{ state: "co", city: "denver", name: "Denver", lawCount: 12 }] } })
      .catch(() => {});
  });
  await page.goto("/");
  const request = page.waitForRequest("**/api/places?**");
  await page.getByRole("searchbox").fill("Denver");
  await request;
  await page.getByRole("button", { name: "Clear search" }).click();
  release();
  await page.waitForTimeout(400);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByLabel("State", { exact: true })).toHaveValue("");
});

test("multiple slider edits survive a responsive remount", async ({ page }) => {
  await page.goto("/");
  const minimums = page.getByRole("slider", { name: /minimum/ });
  await minimums.nth(0).fill("-1");
  await minimums.nth(1).fill("-2");
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(minimums.nth(0)).toHaveValue("-1");
  await expect(minimums.nth(1)).toHaveValue("-2");
});

test("estimated totals do not cap pages, and final-page totals are exact", async ({ page }) => {
  await page.route("**/api/laws?**", async route => {
    const n = Number(new URL(route.request().url()).searchParams.get("page"));
    const json: LawsResponse = {
      ...results, page: n, total: n === 3 ? 17 : 1,
      totalKind: n === 3 ? "exact" : "estimated", hasNextPage: n < 3,
    };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(page.getByText("About 1 result", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: "Next →", exact: true });
  await next.click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByText("17 results", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 3 of 3", { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(page.getByRole("button", { name: "← Prev", exact: true })).toBeEnabled();
});

test("unavailable totals show ranges and empty later pages allow going back", async ({ page }) => {
  await page.route("**/api/laws?**", async route => {
    const n = Number(new URL(route.request().url()).searchParams.get("page"));
    const json: LawsResponse = {
      ...results, page: n, total: null, totalKind: "unavailable",
      rows: n === 2 ? [] : [law], hasNextPage: n === 1,
    };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(page.getByText("Results 1–1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  await expect(page.getByText("No results on this page", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next →", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "← Prev", exact: true }).click();
  await expect(page.getByText("Results 1–1", { exact: true })).toBeVisible();
});

test("overestimates do not enable Next and Funny mode retains the estimate caveat", async ({ page }) => {
  await page.route("**/api/laws?**", route => route.fulfill({
    json: { ...results, total: 99999, totalKind: "estimated", hasNextPage: false },
  }));
  await page.goto("/");
  await expect(page.getByText("About 99,999 results", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next →", exact: true })).toBeDisabled();
  await page.getByTitle("Toggle funny mode").click();
  await expect(page.getByText("About 99,999 ORDINANCES FROM THE VOID", { exact: true })).toBeVisible();
});

test("page controls disable during loading and errors, then retry the same page", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await page.route("**/api/laws?**", async route => {
    const n = Number(new URL(route.request().url()).searchParams.get("page"));
    if (n === 2 && fail) {
      await gate;
      await route.fulfill({ status: 503, json: { error: "offline" } });
    } else {
      await route.fulfill({ json: { ...results, page: n, total: 20 } });
    }
  });
  await page.goto("/");
  const next = page.getByRole("button", { name: "Next →", exact: true });
  const prev = page.getByRole("button", { name: "← Prev", exact: true });
  await next.click();
  await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(prev).toBeDisabled();
  release();
  await expect(page.getByText("Results unavailable", { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(prev).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Retry results" }).click();
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(prev).toBeEnabled();
});

test("desktop and mobile layer controls expose their exclusive selected state", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  for (const name of ["Opacity", "Enforcement Discretion", "Paternalism", "Problem Salience", "Fines"]) {
    const button = nav.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(nav.locator('button[aria-pressed="true"]')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sheet = page.locator("#mobile-navigation");
  await expect(sheet.getByRole("button", { name: "Fines", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Opacity", exact: true }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(sheet.getByRole("button", { name: "Opacity", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Fines", exact: true })).toHaveAttribute("aria-pressed", "false");
});
