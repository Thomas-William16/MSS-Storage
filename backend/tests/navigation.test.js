import { it, expect } from "vitest";
import express from "express";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("navigates sections and history without reloading, preserves preferences, and ignores stale views", async () => {
  const app = express();
  app.use(express.static("frontend"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : undefined),
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    let documents = 0,
      sessions = 0,
      delayEquipment = false;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents++;
    });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path.endsWith("/auth/me") || path.endsWith("/auth/login")) {
        if (path.endsWith("/auth/me")) sessions++;
        data = {
          user: { _id: "admin1", name: "Test Admin", role: "ADMIN" },
          csrfToken: "test",
        };
      } else if (path.endsWith("/reports/dashboard")) {
        data = {
          counts: {},
          physicalItems: 0,
          equipmentTypes: 0,
          overdue: 0,
          pendingRequests: 0,
          lowStock: [],
          recentBorrowings: [],
          recentActivity: [],
        };
      } else if (path.endsWith("/equipment") && delayEquipment) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      await route.fulfill({ json: { data } });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/dashboard.html`);
    await page.getByRole("heading", { name: "Storage overview" }).waitFor();
    await page.evaluate(() => {
      window.navigationMarker = "same-document";
    });
    const nav = page.getByRole("navigation");
    await nav.getByRole("link", { name: "Equipment", exact: true }).click();
    await page
      .getByRole("heading", { name: "Equipment", exact: true })
      .waitFor();
    expect(
      await nav
        .getByRole("link", { name: "Equipment", exact: true })
        .getAttribute("aria-current"),
    ).toBe("page");
    await page.goBack();
    await page.getByRole("heading", { name: "Storage overview" }).waitFor();
    await page.goForward();
    await page
      .getByRole("heading", { name: "Equipment", exact: true })
      .waitFor();
    await nav.getByRole("link", { name: "Requests", exact: true }).click();
    await page.locator("main h1").waitFor();
    await page.getByRole("button", { name: "Dark mode", exact: true }).click();
    delayEquipment = true;
    await nav.getByRole("link", { name: "Equipment", exact: true }).click();
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await page.getByRole("heading", { name: "Storage overview" }).waitFor();
    await page.waitForTimeout(600);
    expect(
      await page.getByRole("heading", { name: "Storage overview" }).count(),
    ).toBe(1);
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    const currentUrl = page.url();
    await page.getByRole("button", { name: "Close navigation" }).click();
    expect(page.url()).toBe(currentUrl);
    expect(
      await page
        .getByRole("button", { name: "Toggle navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      await page
        .getByRole("button", { name: "Toggle navigation" })
        .evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await nav.getByRole("link", { name: "Borrowings", exact: true }).click();
    await page.locator("main h1").waitFor();
    expect(
      await page
        .getByRole("button", { name: "Toggle navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(await page.evaluate(() => window.navigationMarker)).toBe(
      "same-document",
    );
    expect(documents).toBe(1);
    expect(sessions).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("heading", { name: "Sign in to your storage" })
      .waitFor();
    await page.getByLabel("Email address").fill("admin@test.local");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Test-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Storage overview" }).waitFor();
    expect(documents).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
