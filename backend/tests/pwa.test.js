import { it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readFile as read } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import express from "express";
import request from "supertest";
import { chromium } from "@playwright/test";
import { frontendRouter } from "../src/middleware/frontend.js";

it("serves install metadata and valid icons without adding a service worker", async () => {
  const app = express().use(frontendRouter());
  const response = await request(app).get("/manifest.webmanifest");
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = JSON.parse(response.text);
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard.html");
  for (const icon of [
    ...manifest.icons,
    { src: "/icons/apple-touch-icon.png", sizes: "180x180" },
  ]) {
    const result = await request(app).get(icon.src);
    expect(result.status).toBe(200);
    const dimension = Number(icon.sizes.split("x")[0]);
    expect(result.body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(result.body.readUInt32BE(16)).toBe(dimension);
    expect(result.body.readUInt32BE(20)).toBe(dimension);
  }
  expect((await request(app).get("/sw.js")).status).toBe(404);
  expect(await read("frontend/index.html", "utf8")).toContain('rel="manifest"');
  expect(await read("frontend/index.html", "utf8")).toContain(
    'crossorigin="use-credentials"',
  );
});

it("isolates Vercel previews from the live database and uses their own HTTPS origin", () => {
  const inspect = (environment) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'import { config } from "./backend/src/config/env.js"; console.log(JSON.stringify({ database: config.databaseName, origins: config.origins, publicUrl: config.publicUrl }));',
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_ENV: "production",
            VERCEL_ENV: environment,
            VERCEL_URL: "preview.example.test",
            VERCEL_BRANCH_URL: "preview-branch.example.test",
            VERCEL_PROJECT_PRODUCTION_URL: "live.example.test",
            RENDER_EXTERNAL_URL: "",
            FRONTEND_URL: "https://live.example.test",
            PUBLIC_APP_URL: "https://live.example.test",
          },
        },
      ),
    );
  expect(inspect("preview")).toEqual({
    database: "scout_storage_preview",
    origins: [
      "https://preview.example.test",
      "https://preview-branch.example.test",
    ],
    publicUrl: "https://preview-branch.example.test",
  });
  expect(inspect("production")).toEqual({
    origins: ["https://live.example.test"],
    publicUrl: "https://live.example.test",
  });
});

it("offers mobile install guidance, handles a native prompt once, and registers no offline cache", async () => {
  const server = express().use(frontendRouter()).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let authenticated = false;
    await page.route("**/api/v1/**", (route) => {
      if (!authenticated)
        return route.fulfill({
          status: 401,
          json: { error: { message: "Authentication required" } },
        });
      return route.fulfill({
        json: {
          data: {
            user: { _id: "preview", name: "Preview Admin", role: "ADMIN" },
            csrfToken: "test",
          },
        },
      });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/login.html`);
    await page
      .getByRole("heading", { name: "Install on your phone" })
      .waitFor();
    expect(await page.locator(".preview-notice").count()).toBe(
      process.env.VERCEL_ENV === "preview" ? 1 : 0,
    );
    expect(
      await page
        .getByText("Open this website in Safari", { exact: false })
        .isVisible(),
    ).toBe(true);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Preview-test-only");
    await page.getByLabel("Show password", { exact: true }).check();
    expect(
      await page.getByLabel("Password", { exact: true }).getAttribute("type"),
    ).toBe("text");
    await page.getByLabel("Show password", { exact: true }).uncheck();
    expect(
      await page.getByLabel("Password", { exact: true }).getAttribute("type"),
    ).toBe("password");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    authenticated = true;
    await page.goto(`http://127.0.0.1:${server.address().port}/settings.html`);
    await page
      .getByRole("heading", { name: "Install on your phone" })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Install app", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await page
        .getByText("Open this website in Safari", { exact: false })
        .isVisible(),
    ).toBe(true);
    await page.evaluate(() => {
      window.installCalls = 0;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => {
        window.installCalls++;
        return { outcome: "dismissed" };
      };
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    expect(await page.evaluate(() => window.installCalls)).toBe(1);
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .waitFor({ state: "detached" });
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await page
      .getByText("Scout Storage is running as an app.", { exact: true })
      .waitFor();
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    ).toBe(0);
    expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(
      0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
