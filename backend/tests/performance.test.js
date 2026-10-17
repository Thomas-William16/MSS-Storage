import { it, expect } from "vitest";
import express from "express";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("defers workflow code, translates only changed content, and cancels superseded filters", async () => {
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
    const scripts = [];
    const errors = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/auth/me")) {
        return route.fulfill({
          status: 401,
          json: { error: { message: "Authentication required" } },
        });
      }
      const filter = url.searchParams.get("filter");
      if (filter === "slow")
        await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ json: { data: [{ name: filter || "initial" }] } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/login.html`);
    await page
      .getByRole("heading", { name: "Sign in to your storage" })
      .waitFor();
    expect(
      scripts.some((url) => /\/(catalog|workflows|reports)-/.test(url)),
    ).toBe(false);

    await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
    await page.evaluate(() => {
      const section = document.createElement("section");
      section.id = "large-fixture";
      for (let i = 0; i < 1000; i++) {
        const paragraph = document.createElement("p");
        paragraph.textContent = "Save";
        section.append(paragraph);
      }
      document.body.append(section);
    });
    await page.waitForFunction(
      () => document.querySelector("#large-fixture p")?.textContent === "حفظ",
    );
    await page.evaluate(() => {
      window.visitedTextNodes = 0;
      const original = document.createTreeWalker.bind(document);
      document.createTreeWalker = (...args) => {
        const walker = original(...args);
        const next = walker.nextNode.bind(walker);
        walker.nextNode = () => {
          const node = next();
          if (node) window.visitedTextNodes++;
          return node;
        };
        return walker;
      };
      const notice = document.createElement("div");
      notice.id = "small-update";
      notice.textContent = "Save";
      document.body.append(notice);
    });
    await page.waitForFunction(
      () => document.getElementById("small-update").textContent === "حفظ",
    );
    const visited = await page.evaluate(() => window.visitedTextNodes);
    expect(visited).toBeLessThan(10);
    console.log(
      `One inserted label visited ${visited} text nodes with 1,000 existing labels.`,
    );
    await page.getByRole("button", { name: "Switch to English" }).click();
    await page.waitForFunction(
      () => document.querySelector("#large-fixture p").textContent === "Save",
    );
    await page.addScriptTag({
      type: "module",
      content:
        'import { pagedList } from "/js/lists.js"; window.testPagedList = pagedList;',
    });
    await page.waitForFunction(
      () => typeof window.testPagedList === "function",
    );
    await page.evaluate(() => {
      window.cancelledListRequests = 0;
      const original = window.fetch;
      window.fetch = (...args) => {
        if (String(args[0]).includes("/performance")) {
          args[1]?.signal?.addEventListener(
            "abort",
            () => window.cancelledListRequests++,
          );
        }
        return original(...args);
      };
      const container = document.createElement("section");
      container.id = "list-fixture";
      document.body.append(container);
      window.testPagedList(container, {
        path: "/performance",
        search: false,
        columns: [{ key: "name", label: "Name" }],
        filters: [
          {
            name: "filter",
            label: "Performance filter",
            options: [
              { value: "slow", label: "Slow" },
              { value: "fast", label: "Fast" },
            ],
          },
        ],
      });
    });
    await page
      .locator("#list-fixture td")
      .filter({ hasText: "initial" })
      .waitFor();
    await page.getByLabel("Performance filter").selectOption("slow");
    await page.getByLabel("Performance filter").selectOption("fast");
    await page
      .locator("#list-fixture td")
      .filter({ hasText: "fast" })
      .waitFor();
    await page.waitForTimeout(400);
    expect(await page.locator("#list-fixture td").allTextContents()).toEqual([
      "fast",
    ]);
    expect(
      await page.evaluate(() => window.cancelledListRequests),
    ).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
