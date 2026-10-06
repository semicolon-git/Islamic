import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";
import data from "../../data/sky/stars.json";
import { computeSky, type StarRecord } from "../../src/features/sky/engine";

// 21:00 in Riyadh on 6 October 2026: dark, and Vega is halfway up in the north-west.
const NIGHT = new Date("2026-10-06T18:00:00Z");
// Noon in Riyadh the same day: the Sun is high.
const NOON = new Date("2026-10-06T09:00:00Z");
const RIYADH = { latitude: 24.7136, longitude: 46.6753 };
const stars = data.stars as unknown as StarRecord[];

/** Where Vega is for the place the app will use (it rounds the device location to 0.01°). */
function vegaFor(lat: number, lon: number, at = NIGHT) {
  const vega = computeSky({ lat, lon }, at, stars).objects.find((o) => o.id === "vega")!;
  return { az: vega.az, alt: vega.alt };
}

/** Pretend the phone (held in portrait, no roll) points at az/alt: W3C absolute alpha = −azimuth, beta = 90° + altitude. */
async function pointAt(page: Page, p: { az: number; alt: number }) {
  await page.evaluate(({ az, alt }) => {
    const init = { alpha: (360 - az) % 360, beta: 90 + alt, gamma: 0, absolute: true };
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", init));
  }, p);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
});

test.describe("with location and compass", () => {
  test.use({ geolocation: RIYADH, permissions: ["geolocation"], timezoneId: "Asia/Riyadh" });

  test("pointing at Vega names it, in English and Arabic, and links to its page", async ({ page }) => {
    await page.clock.setFixedTime(NIGHT);
    await page.goto("/sky");
    await expect(page.getByRole("heading", { level: 1, name: "What's in the sky?" })).toBeVisible();
    // Permission already granted: the device location is used straight away, rounded and never stored.
    await expect(page.getByTestId("sky-place-label")).toHaveText("Sky over your location");
    await expect(page.getByText("Approximate location, used on this phone only. Never sent or stored.")).toBeVisible();
    // Today's Hijri date (Umm al-Qura) with the honest note about sighting.
    await expect(page.getByTestId("sky-hijri")).toHaveText("Rabiʻ II 25, 1448 AH");
    await expect(page.getByText(/may differ by a day/)).toBeVisible();
    await expect(page.getByTestId("sky-day")).toHaveCount(0);

    await page.getByRole("button", { name: "Start pointing" }).click();
    await pointAt(page, vegaFor(24.71, 46.68));
    await expect(page.getByTestId("sky-view")).toBeVisible();
    await expect(page.getByTestId("sky-target-name")).toHaveText("Vega");
    await expect(page.getByTestId("sky-target-second")).toHaveText("«النسر الواقع»");
    await expect(page.getByTestId("sky-target")).toContainText("About Vega");
    await expect(page.getByTestId("sky-nearby").getByRole("link")).not.toHaveCount(0);
    await expectAccessible(page);

    // Turn away to empty sky low in the south-east: no false naming.
    await pointAt(page, { az: 135, alt: 2 });
    await expect(page.getByTestId("sky-target-name")).toHaveCount(0);

    // Back to Vega, then open its page.
    await pointAt(page, vegaFor(24.71, 46.68));
    await expect(page.getByTestId("sky-target-name")).toHaveText("Vega");
    await page.getByTestId("sky-target").getByRole("link", { name: "About Vega" }).click();
    await expect(page).toHaveURL(/\/sky\/star\/vega$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vega" })).toBeVisible();
    const arabic = page.getByTestId("arabic-name");
    await expect(arabic.getByRole("heading", { name: "Name from Arabic astronomy" })).toBeVisible();
    await expect(arabic).toContainText("النسر الواقع");
    await expect(arabic).toContainText("al-nasr al-wāqiʿ");
    await expect(arabic).toContainText("“the swooping eagle”");
    await expect(arabic).toContainText("Kunitzsch & T. Smart, A Dictionary of Modern Star Names");
    await expect(arabic).toContainText("al-Ṣūfī");
    // The Quran is rendered by reference (KFGQPC table), not typed: 6:97 and 16:16.
    const quran = page.getByTestId("sky-quran");
    await expect(quran.locator("blockquote.quran")).toHaveCount(2);
    await expect(quran.getByText("6:97", { exact: true })).toBeVisible();
    await expect(quran.getByText("16:16", { exact: true })).toBeVisible();
    await expect(page.getByTestId("astrolabe-link")).toHaveAttribute("href", "/science/instrument/astrolabe");
    await expect(page.getByText("Lyra", { exact: false }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test("find mode steers toward a star", async ({ page }) => {
    await page.clock.setFixedTime(NIGHT);
    await page.goto("/sky?find=altair");
    await expect(page.getByTestId("sky-find")).toContainText("Finding Altair");
    await expect(page.getByTestId("visible-altair")).toHaveClass(/border-accent/);
    await page.getByRole("button", { name: "Start pointing" }).click();
    const vega = vegaFor(24.71, 46.68);
    await pointAt(page, vega);
    await expect(page.getByTestId("sky-target-name")).toHaveText("Vega");
    await expect(page.getByTestId("sky-steer")).toContainText(/Turn (left|right) \d+°/);
  });
});

test.describe("without compass or location", () => {
  test.use({ timezoneId: "Asia/Riyadh" });

  test("falls back to Riyadh and a 'Visible now' list with plain-words directions", async ({ page }) => {
    await page.clock.setFixedTime(NIGHT);
    await page.goto("/sky");
    await expect(page.getByTestId("sky-place-label")).toHaveText("Sky over Riyadh");
    await expect(page.getByTestId("sky-permissions")).toContainText("never sent, never stored");

    const list = page.getByTestId("visible-list");
    await expect(list).toBeVisible();
    const vega = page.getByTestId("visible-vega");
    await expect(vega).toContainText("Vega");
    await expect(vega).toContainText("النسر الواقع");
    await expect(vega).toContainText("Halfway up in the north-west");
    await expect(vega).toContainText("NW · 301°");
    await expect(vega).toHaveAttribute("href", "/sky/star/vega");
    // Saturn is up in the east-south-east tonight; planets link by name.
    await expect(page.getByTestId("visible-saturn")).toHaveAttribute("href", "/sky/star/saturn");

    // No compass readings arrive (headless): a calm message, and the list stays.
    await page.getByRole("button", { name: "Start pointing" }).click();
    await expect(page.getByTestId("compass-status")).toContainText("compass", { timeout: 8000 });
    await expect(list).toBeVisible();
    await expectAccessible(page);

    // Location refused (simulated: headless Chromium leaves an ungranted prompt hanging) → explained, and the city stays.
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
    });
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText("Location is off for this site, so we're using a city instead.", { exact: false })).toBeVisible();
    await expect(page.getByTestId("sky-place-label")).toHaveText("Sky over Riyadh");

    // Pick another city, then type coordinates.
    await page.getByRole("button", { name: "Change place" }).click();
    await page.getByLabel("Choose a city").selectOption("london");
    await expect(page.getByTestId("sky-place-label")).toHaveText("Sky over London");
    await page.getByLabel("Latitude").fill("100");
    await page.getByLabel("Longitude").fill("10");
    await page.getByRole("button", { name: "Show this sky" }).click();
    await expect(page.getByTestId("sky-place").getByRole("alert")).toContainText("latitude between −90 and 90");
    await page.getByLabel("Latitude").fill("21.42");
    await page.getByLabel("Longitude").fill("39.83");
    await page.getByRole("button", { name: "Show this sky" }).click();
    await expect(page.getByTestId("sky-place-label")).toHaveText("Sky over 21.42, 39.83");
  });

  test("by day: says stars aren't visible, shows the Sun and Moon and when it gets dark", async ({ page }) => {
    await page.clock.setFixedTime(NOON);
    await page.goto("/sky");
    await expect(page.getByTestId("sky-day")).toContainText("Come back after sunset at 17:35");
    await expect(page.getByTestId("sky-day")).toContainText("Never look directly at the Sun.");
    await expect(page.getByTestId("visible-sun")).toBeVisible();
    await expect(page.getByTestId("visible-list").locator('[data-testid^="visible-"]').filter({ hasNotText: /Sun|Moon/ })).toHaveCount(0);
    await expectAccessible(page);
  });
});

test.describe("Arabic", () => {
  test.use({ geolocation: RIYADH, permissions: ["geolocation"], timezoneId: "Asia/Riyadh" });

  test("points at Vega right-to-left: «النسر الواقع» first, Vega second", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "lang", value: "ar", url: baseURL! }]);
    await page.clock.setFixedTime(NIGHT);
    await page.goto("/sky");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "ماذا في السماء؟" })).toBeVisible();
    await expect(page.getByTestId("sky-hijri")).toHaveText("٢٥ ربيع الآخر ١٤٤٨ هـ");
    await page.getByRole("button", { name: "ابدأ الإشارة" }).click();
    await pointAt(page, vegaFor(24.71, 46.68));
    await expect(page.getByTestId("sky-target-name")).toHaveText("النسر الواقع");
    await expect(page.getByTestId("sky-target-second")).toHaveText("Vega");
    await expect(page.getByTestId("visible-vega")).toContainText("في منتصف السماء جهة الشمال الغربي");
    await expectAccessible(page);

    await page.goto("/sky/star/vega");
    await expect(page.getByRole("heading", { level: 1, name: "النسر الواقع" })).toBeVisible();
    await expect(page.getByTestId("arabic-name")).toContainText("اسم من علم الفلك العربي");
    await expectAccessible(page);
  });
});

test("moon and planet pages, and unknown ids", async ({ page }) => {
  await page.goto("/sky/star/moon");
  await expect(page.getByRole("heading", { level: 1, name: "Moon" })).toBeVisible();
  await expect(page.getByTestId("moon-card-link")).toHaveAttribute("href", "/c/moon");
  await expectAccessible(page);
  await page.goto("/sky/star/jupiter");
  await expect(page.getByRole("heading", { level: 1, name: "Jupiter" })).toBeVisible();
  await expect(page.getByText(/times the Earth–Sun distance/)).toBeVisible();
  const res = await page.goto("/sky/star/not-a-star");
  expect(res?.status()).toBe(404);
});
