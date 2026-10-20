import { it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { readFile, readdir } from "node:fs/promises";
import { packageFrontend } from "../../scripts/package-frontend.js";

it("packages only browser files and serves them without backend/database calls", async () => {
  await packageFrontend();
  const entries = await readdir("public");
  expect(
    entries
      .filter((name) => name !== ".gitkeep")
      .every(
        (name) =>
          name.endsWith(".html") ||
          ["css", "dist", "favicon.svg"].includes(name),
      ),
  ).toBe(true);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  expect(config.outputDirectory).toBe("public");
  expect(config.buildCommand).toBe("npm run build:vercel");
  expect(config.rewrites.map((rule) => rule.source)).toEqual([
    "/api/:path*",
    "/health",
  ]);
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
  gateway.use(express.static("public"));
  gateway.use((req, res) => {
    backendRequests++;
    res.status(503).end();
  });
  const chunks = await readdir("public/dist/chunks");
  for (const path of [
    "/",
    "/login.html",
    "/dashboard.html",
    "/equipment.html",
    "/css/style.css",
    "/favicon.svg",
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
  ])
    expect((await request(gateway).get(path)).status).toBe(503);
});
