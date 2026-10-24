import { it, expect } from "vitest";
import express from "express";
import { frontendRouter } from "../src/middleware/frontend.js";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("persists language/theme for all roles, mirrors mobile navigation, and reuses Scout return controls", async () => {
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
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let role = "SCOUT",
      returned;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path.endsWith("/reports/dashboard"))
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
      if (path.endsWith("/categories") || path.endsWith("/equipment"))
        data = [];
      if (path.endsWith("/auth/me"))
        data = {
          user: { _id: "scout1", name: "Test User", role },
          csrfToken: "test",
        };
      else if (path.endsWith("/borrowings/loan1/return"))
        returned = route.request().postDataJSON();
      else if (path.endsWith("/borrowings/loan1"))
        data = {
          _id: "loan1",
          user: { _id: "scout1", name: "Test User" },
          purpose: "Camp",
          status: "ACTIVE",
          items: [
            {
              equipmentItem: {
                _id: "item1",
                itemCode: "TENT-001",
                equipmentId: { name: "Tent" },
              },
              conditionBefore: "GOOD",
            },
          ],
        };
      await route.fulfill({ json: { data } });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (role of ["ADMIN", "STORAGE_KEEPER", "SCOUT"]) {
      await page.goto(`${base}/dashboard.html`);
      await page
        .getByRole("heading", { name: "Quick actions", exact: true })
        .waitFor();
      expect(
        await page
          .locator(".quick-actions")
          .getByRole("button", {
            name: role === "SCOUT" ? "Request equipment" : "Issue equipment",
            exact: true,
          })
          .count(),
      ).toBe(1);
      expect(
        await page
          .locator(".quick-actions")
          .getByRole("link", {
            name: role === "SCOUT" ? "My borrowings" : "Record returns",
            exact: true,
          })
          .count(),
      ).toBe(1);
      await page.goto(`${base}/equipment.html`);
      await page
        .getByRole("heading", { name: "Equipment", exact: true })
        .waitFor();
      expect(
        await page.locator('#navigation a[href="categories.html"]').count(),
      ).toBe(0);
      expect(
        await page.getByRole("button", { name: "Add new category" }).count(),
      ).toBe(role === "ADMIN" ? 1 : 0);
      await page.goto(`${base}/borrowings.html?id=loan1`);
      await page
        .getByRole("button", { name: "Record returns", exact: true })
        .waitFor();
      await page.getByRole("combobox", { name: "Language" }).selectOption("ar");
      await page
        .getByRole("button", { name: "تسجيل الإرجاع", exact: true })
        .waitFor();
      expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
      await page.getByRole("button", { name: "الوضع الداكن" }).click();
      await page.reload();
      await page
        .getByRole("button", { name: "تسجيل الإرجاع", exact: true })
        .waitFor();
      expect(await page.locator("html").getAttribute("data-theme")).toBe(
        "dark",
      );
      await page
        .getByRole("button", { name: "تسجيل الإرجاع", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("dialog")
          .evaluate((node) => getComputedStyle(node).backgroundColor),
      ).toBe("rgb(41, 34, 48)");
      await page
        .getByRole("button", { name: "تحديد الكل", exact: true })
        .click();
      await page
        .getByRole("button", { name: "تسجيل الإرجاع", exact: true })
        .last()
        .click();
      await page.waitForFunction(() => !document.querySelector("dialog"));
      expect(returned.items).toEqual([
        { itemId: "item1", condition: "GOOD", lost: false, notes: "" },
      ]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "فتح القائمة" }).click();
      await page.waitForFunction(
        () =>
          Math.round(
            document.querySelector(".sidebar").getBoundingClientRect().right,
          ) === innerWidth,
      );
      const box = await page.locator(".sidebar").boundingBox();
      expect(Math.round(box.x + box.width)).toBe(390);
      await page.getByRole("button", { name: "إغلاق القائمة" }).click();
      expect(
        await page
          .getByRole("button", { name: "فتح القائمة" })
          .getAttribute("aria-expanded"),
      ).toBe("false");
      await page
        .getByRole("combobox", { name: "Language" })
        .selectOption("ar-Latn");
      await page
        .getByRole("button", { name: "Saggel el erga3", exact: true })
        .waitFor();
      expect(await page.locator("html").getAttribute("dir")).toBe("ltr");
      expect(await page.locator("html").getAttribute("lang")).toBe("ar-Latn");
      expect(await page.locator(".account-name").textContent()).toContain(
        "Test User",
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Saggel el erga3", exact: true })
        .waitFor();
      expect(
        await page.getByRole("combobox", { name: "Language" }).inputValue(),
      ).toBe("ar-Latn");
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const controls = await page
          .locator(".topbar .preference-controls")
          .boundingBox();
        const menu = await page.locator(".menu-toggle").boundingBox();
        expect(controls.x + controls.width).toBeLessThanOrEqual(menu.x);
      }
      // Short mobile screens must keep every menu entry reachable without
      // wrapping labels, and keep the close button outside the scrolling list.
      await page.setViewportSize({ width: 320, height: 568 });
      for (const locale of ["en", "ar", "ar-Latn"]) {
        await page
          .getByRole("combobox", { name: "Language" })
          .selectOption(locale);
        await page.locator("#menu-toggle").click();
        const navigation = page.locator("#navigation");
        expect(
          await navigation.evaluate((node) => {
            return [
              ...node.querySelectorAll(".nav-link > span:not([aria-hidden])"),
            ].every((label) => {
              const range = document.createRange();
              range.selectNodeContents(label);
              return (
                label.scrollWidth <= label.clientWidth &&
                range.getClientRects().length === 1
              );
            });
          }),
        ).toBe(true);
        expect(
          await navigation.evaluate(
            (node) => node.scrollHeight > node.clientHeight,
          ),
        ).toBe(true);
        await navigation.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        expect(
          await navigation.evaluate((node) => node.scrollTop),
        ).toBeGreaterThan(0);
        const finalLink = await navigation.locator("a").last().boundingBox();
        const scrollArea = await navigation.boundingBox();
        expect(finalLink.y + finalLink.height).toBeLessThanOrEqual(
          scrollArea.y + scrollArea.height + 1,
        );
        await page.locator(".sidebar-back").click();
        expect(
          await page.locator("#menu-toggle").getAttribute("aria-expanded"),
        ).toBe("false");
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("combobox", { name: "Language" }).selectOption("en");
      await page
        .getByRole("button", { name: "Record returns", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Dark mode" }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 401,
        json: { error: { message: "Authentication required" } },
      }),
    );
    await page.goto(`${base}/login.html`);
    await page.getByRole("combobox", { name: "Language" }).selectOption("ar");
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .waitFor();
    await page
      .getByRole("combobox", { name: "Language" })
      .selectOption("ar-Latn");
    await page
      .getByRole("button", { name: "Tasgeel el dokhoul", exact: true })
      .waitFor();
    await page
      .getByRole("textbox", { name: "El email" })
      .fill("scout@example.com");
    await page.getByRole("combobox", { name: "Language" }).selectOption("en");
    expect(
      await page.getByRole("textbox", { name: "Email address" }).inputValue(),
    ).toBe("scout@example.com");
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
