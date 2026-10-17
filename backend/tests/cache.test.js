import { afterEach, it, expect, vi } from "vitest";
import request from "supertest";
import { readdir } from "node:fs/promises";
import { app } from "../src/app.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});
const response = (data, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => (ok ? { data } : { error: { message: "Unavailable" } }),
});

it("caches versioned chunks, revalidates entry files, and excludes API responses", async () => {
  const chunks = await readdir("frontend/dist/chunks");
  const chunk = chunks.find((name) => /-[A-Z0-9]{8}\.js$/.test(name));
  expect(chunk).toBeTruthy();
  const asset = await request(app).get(`/dist/chunks/${chunk}`);
  expect(asset.status).toBe(200);
  expect(asset.headers["cache-control"]).toBe(
    "public, max-age=31536000, immutable",
  );
  for (const path of ["/login.html", "/dist/app.js", "/css/style.css"]) {
    const result = await request(app).get(path);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    const revalidated = await request(app)
      .get(path)
      .set("If-None-Match", result.headers.etag);
    expect(revalidated.status).toBe(304);
  }
  for (const path of ["/api/v1/equipment", "/api/v1/auth/me", "/api/missing"]) {
    const result = await request(app).get(path);
    expect(result.headers["cache-control"]).toBe("private, no-store");
  }
});

it("shares category lookups, protects cached rows from caller edits, and leaves stock live", async () => {
  const fetch = vi.fn(async () => response([{ _id: "cat1", name: "Camping" }]));
  vi.stubGlobal("fetch", fetch);
  const { all } = await import("../../frontend/js/api.js");
  const [first, second] = await Promise.all([
    all("/categories"),
    all("/categories"),
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  first.push({ name: "Local draft" });
  second[0].name = "Changed";
  expect(await all("/categories")).toEqual([{ _id: "cat1", name: "Camping" }]);
  await all("/equipment");
  await all("/equipment");
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("expires category data and invalidates it after writes and session changes", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetch = vi.fn(async (url) =>
    response(
      String(url).includes("/auth/")
        ? { user: { name: "Next user" }, csrfToken: "token" }
        : [],
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const { all, api, session, login } = await import("../../frontend/js/api.js");
  await all("/categories");
  now = 59_999;
  await all("/categories");
  expect(fetch).toHaveBeenCalledTimes(1);
  now = 60_000;
  await all("/categories");
  expect(fetch).toHaveBeenCalledTimes(2);
  await api("/categories", { method: "POST", body: { name: "New" } });
  await all("/categories");
  expect(fetch).toHaveBeenCalledTimes(4);
  await session();
  await all("/categories");
  expect(fetch).toHaveBeenCalledTimes(6);
  await login("next@test.local", "password");
  await all("/categories");
  expect(fetch).toHaveBeenCalledTimes(8);
});

it("does not retain failed lookups or resurrect in-flight data after invalidation", async () => {
  let resolveOld;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(null, false))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(response({}))
    .mockResolvedValueOnce(response([{ name: "Fresh" }]));
  vi.stubGlobal("fetch", fetch);
  const { all, api } = await import("../../frontend/js/api.js");
  await expect(all("/categories")).rejects.toThrow("Unavailable");
  const old = all("/categories");
  await api("/categories", { method: "POST", body: { name: "Fresh" } });
  expect(await all("/categories")).toEqual([{ name: "Fresh" }]);
  resolveOld(response([{ name: "Old" }]));
  await old;
  expect(await all("/categories")).toEqual([{ name: "Fresh" }]);
  expect(fetch).toHaveBeenCalledTimes(4);
});
