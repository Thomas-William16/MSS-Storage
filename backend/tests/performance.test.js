import { it, expect } from "vitest";
import express from "express";
import { frontendRouter } from "../src/middleware/frontend.js";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

it("defers workflow code and translates only changed content", async () => {
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
      scripts.some((url) => /\/(catalog|workflow|report)-pages-/.test(url)),
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
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
