import { it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { readFile, readdir } from "node:fs/promises";
import { packageFrontend } from "../../scripts/package-frontend.js";
import { frontendRouter } from "../src/middleware/frontend.js";
import { pagePaths } from "../../shared/page-paths.js";
import { resolve } from "node:path";

it("packages only browser files and serves them without backend/database calls", async () => {
  await packageFrontend();
  const entries = await readdir("public");
  expect(entries.filter((name) => name.endsWith(".html"))).toEqual([
    "index.html",
  ]);
  expect(
    (await readdir("frontend")).filter((name) => name.endsWith(".html")),
  ).toEqual(["index.html"]);
  expect(
    entries
      .filter((name) => name !== ".gitkeep")
      .every(
        (name) =>
          name.endsWith(".html") ||
          [
            "css",
            "dist",
            "icons",
            "favicon.svg",
            "manifest.webmanifest",
          ].includes(name),
      ),
  ).toBe(true);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  expect(config.outputDirectory).toBe("public");
  expect(config.buildCommand).toBe("npm run build:vercel");
  expect(
    config.rewrites
      .filter((rule) => rule.destination === "/api")
      .map((rule) => rule.source),
  ).toEqual(["/api/:path*", "/health"]);
  const expectedPages = pagePaths
    .filter((page) => page !== "index.html")
    .map((page) => ({ source: `/${page}`, destination: "/index.html" }));
  expect(
    config.rewrites.filter((rule) => rule.destination === "/index.html"),
  ).toEqual(expectedPages);
  const staticConfig = JSON.parse(
    await readFile("frontend/vercel.json", "utf8"),
  );
  expect(staticConfig.rewrites).toEqual(expectedPages);
  expect(
    config.headers.find((rule) => rule.source === "/dist/chunks/(.*)")
      .headers[0].value,
  ).toContain("immutable");
  expect(
    config.headers
      .find((rule) => rule.source === "/(.*)")
      .headers.some((header) => header.key === "Content-Security-Policy"),
  ).toBe(true);
  let backendRequests = 0;
  const gateway = express();
  gateway.use(frontendRouter(resolve("public")));
  gateway.use("/api", (req, res) => {
    backendRequests++;
    res.status(503).end();
  });
  gateway.use((req, res) =>
    res.status(404).json({ error: { message: "Not found" } }),
  );
  const chunks = await readdir("public/dist/chunks");
  for (const path of [
    "/",
    ...pagePaths.map((page) => `/${page}`),
    "/equipment-item.html?id=abc123",
    "/css/style.css",
    "/favicon.svg",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/icons/apple-touch-icon.png",
    "/dist/app.js",
    `/dist/chunks/${chunks[0]}`,
  ])
    expect((await request(gateway).get(path)).status).toBe(200);
  expect(backendRequests).toBe(0);
  for (const path of [
    "/js/api.js",
    "/vercel.json",
    "/.env",
    "/backend/src/app.js",
    "/unknown.html",
    "/dist/missing.js",
    "/css/missing.css",
    "/icons/missing.png",
  ])
    expect((await request(gateway).get(path)).status).toBe(404);
  expect((await request(gateway).get("/api/v1/missing")).status).toBe(503);
  expect(backendRequests).toBe(1);
});
