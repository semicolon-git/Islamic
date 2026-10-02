import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";
import { as, randomToken } from "./util";

test("the demand board updates live when a visitor posts a request", async ({ page, request }) => {
  await as(page, "u_huda", "/portal/demand");
  await expectAccessible(page);
  const groups = page.getByTestId("demand-groups");
  await expect(groups).toContainText("Mountain");
  await expect(groups.locator("[data-key='concept:fig']")).toHaveCount(0);

  // a visitor taps "Notify me" on the fig concept (B1's /api/requests if present, otherwise our public endpoint)
  const token = randomToken();
  let posted = false;
  const viaRequests = await request.post("/api/requests", { data: { device_token: token, concept_id: "fig" } });
  if (viaRequests.ok()) posted = true;
  if (!posted) {
    const r = await request.post("/api/demand", { data: { device_token: token, concept_id: "fig" } });
    expect(r.status()).toBe(201);
  }
  const fig = groups.locator("[data-key='concept:fig']");
  await expect(fig).toBeVisible({ timeout: 20_000 });
  await expect(fig.getByTestId("demand-count")).toHaveText("1");

  // the same device asking twice is counted once
  const again = await request.post("/api/demand", { data: { device_token: token, concept_id: "fig" } });
  expect((await again.json()).data.duplicate).toBe(true);

  // "Create card" prefills the concept
  await fig.getByTestId("demand-create").click();
  await expect(page).toHaveURL(/\/portal\/cards\/new\?concept=fig/);
  await expect(page.locator("#concept")).toHaveValue("fig");
});

test("requests need a topic and a valid device token", async ({ request }) => {
  expect((await request.post("/api/demand", { data: { device_token: randomToken() } })).status()).toBe(400);
  expect((await request.post("/api/demand", { data: { device_token: "short", concept_id: "fig" } })).status()).toBe(400);
});
