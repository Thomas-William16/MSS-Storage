import { it, expect } from "vitest";
import express from "express";
import { frontendRouter } from "../src/middleware/frontend.js";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("preserves filters, paging and scroll, cancels old requests, and retains drafts with field errors", async () => {
  const app = express();
  app.use(frontendRouter());
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    const errors = [];
    let documents = 0,
      creates = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents++;
    });
    const categories = [
      { _id: "a".repeat(24), name: "Slow" },
      { _id: "b".repeat(24), name: "Fast" },
    ];
    const equipment = (index) => ({
      _id: String(index).padStart(24, "0"),
      name: `Tent ${String(index).padStart(2, "0")}`,
      category: categories[1],
      counts: { total: 2, available: 2, borrowed: 0, maintenance: 0 },
    });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const path = url.pathname;
      if (path.endsWith("/auth/me"))
        return route.fulfill({
          json: {
            data: {
              user: { _id: "admin", name: "Test Admin", role: "ADMIN" },
              csrfToken: "test",
            },
          },
        });
      if (path.endsWith("/categories"))
        return route.fulfill({ json: { data: categories } });
      if (path.endsWith("/equipment") && request.method() === "POST") {
        creates++;
        return route.fulfill({
          status: 400,
          json: {
            error: {
              message: "Please correct the equipment name",
              fields: { name: "Choose a different name" },
            },
          },
        });
      }
      if (path.endsWith("/equipment")) {
        if (url.searchParams.get("category") === categories[0]._id)
          await new Promise((resolve) => setTimeout(resolve, 350));
        const pageNumber = Number(url.searchParams.get("page") || 1);
        return route.fulfill({
          json: {
            data: Array.from({ length: 25 }, (_, index) =>
              equipment((pageNumber - 1) * 25 + index + 1),
            ),
            meta: { page: pageNumber, total: 50, pages: 2, limit: 25 },
          },
        });
      }
      if (/\/equipment\/[^/]+\/items$/.test(path))
        return route.fulfill({ json: { data: [] } });
      if (/\/equipment\/[^/]+$/.test(path))
        return route.fulfill({
          json: { data: equipment(Number(path.split("/").pop())) },
        });
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/equipment.html`);
    await page.getByRole("link", { name: "Tent 01", exact: true }).waitFor();
    await page.evaluate(() => {
      window.cancelledRequests = 0;
      const original = window.fetch;
      window.fetch = (...args) => {
        args[1]?.signal?.addEventListener(
          "abort",
          () => window.cancelledRequests++,
        );
        return original(...args);
      };
    });
    await page.getByRole("searchbox", { name: "Search records" }).fill("Tent");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByLabel("All categories").selectOption(categories[0]._id);
    await page.getByLabel("All categories").selectOption(categories[1]._id);
    await page.getByRole("link", { name: "Tent 01", exact: true }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("link", { name: "Tent 26", exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(80);
    // Use a visible row so clicking does not move the page back to its top.
    const row = page.getByRole("link", { name: "Tent 32", exact: true });
    await row.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await row.click();
    await page.getByRole("heading", { name: "Tent 32", exact: true }).waitFor();
    await page.getByRole("link", { name: "← Equipment", exact: true }).click();
    await page.getByRole("link", { name: "Tent 26", exact: true }).waitFor();
    expect(
      await page
        .getByRole("searchbox", { name: "Search records" })
        .inputValue(),
    ).toBe("Tent");
    expect(await page.getByLabel("All categories").inputValue()).toBe(
      categories[1]._id,
    );
    expect(new URL(page.url()).searchParams.get("page")).toBe("2");
    await page.waitForFunction(
      (target) => Math.abs(window.scrollY - target) < 8,
      before,
    );
    expect(await page.evaluate(() => window.cancelledRequests)).toBeGreaterThan(
      0,
    );
    await page.getByRole("button", { name: "New equipment" }).click();
    await page.getByLabel("Equipment name").fill("Retained draft");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Keep these notes");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Choose a different name", { exact: true }).waitFor();
    expect(await page.getByLabel("Equipment name").inputValue()).toBe(
      "Retained draft",
    );
    expect(
      await page.getByLabel("Description", { exact: true }).inputValue(),
    ).toBe("Keep these notes");
    expect(
      await page.getByLabel("Equipment name").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(creates).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .getByRole("button", { name: "Save", exact: true })
        .evaluate((node) => node.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(documents).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
