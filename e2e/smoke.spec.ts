import { expect, test } from "@playwright/test";

test("search a coin and read its verdict", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /stood where/i }),
  ).toBeVisible();

  const box = page.getByRole("combobox");
  await box.fill("filecoin");
  const option = page.getByRole("option", { name: /Filecoin/ }).first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/coin\/filecoin$/);
  const verdict = page.getByRole("heading", { level: 1 });
  await expect(verdict).toHaveText(
    /lost to BTC|beat BTC|No clear edge|Not enough history/,
  );
  // Next keeps the previous page mounted but hidden, so match visible text only.
  await expect(
    page.getByText(/past episodes like this beat/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The five closest twins" }),
  ).toBeVisible();
});

test("receipts drawer shows the CoinMarketCap call", async ({ page }) => {
  await page.goto("/coin/filecoin");
  await page.getByRole("button", { name: /Receipts/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("/v1/cryptocurrency/listings/latest");
  await expect(drawer).not.toContainText(/CMC_PRO_API_KEY|X-CMC_PRO_API_KEY/i);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("pages fit the screen with no sideways scroll", async ({ page }) => {
  for (const path of ["/", "/coin/filecoin", "/method"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("stablecoins and BTC are refused, unknown slugs 404", async ({ page }) => {
  await page.goto("/coin/tether");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /tracks another asset/,
  );
  await page.goto("/coin/bitcoin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/yardstick/);
  await page.goto("/coin/no-such-coin-here");
  await expect(page.getByText("No coin by that name.")).toBeVisible();
});

test("search page lists matches", async ({ page }) => {
  await page.goto("/search?q=polka");
  await expect(page.getByRole("link", { name: /Polkadot/ })).toBeVisible();
});
