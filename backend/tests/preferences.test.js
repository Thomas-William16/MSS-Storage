import { it, expect } from "vitest";
import express from "express";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("persists language/theme for all roles, mirrors mobile navigation, and reuses Scout return controls", async () => {
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
    page.on("pageerror", (error) => errors.push(error.message));
    let role = "SCOUT",
      returned;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
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
      await page.goto(`${base}/borrowings.html?id=loan1`);
      await page
        .getByRole("button", { name: "Record returns", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
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
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("button", { name: "Switch to English" }).click();
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
    await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .waitFor();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
