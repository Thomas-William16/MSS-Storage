import { afterEach, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../src/app.js";
import { publicUser } from "../src/serializers/users.js";
import { errorHandler } from "../src/middleware/errors.js";
import { AppError } from "../src/utils/errors.js";
import { logger } from "../src/utils/logger.js";
import { password } from "../src/middleware/validation.js";

afterEach(() => vi.restoreAllMocks());

it("requires eight characters and rejects trivial passwords while allowing Unicode", () => {
  for (const value of [
    "Short1!",
    "a".repeat(20),
    "123456789012345",
    "password123456789",
    "é".repeat(40),
  ])
    expect(password.safeParse(value).success).toBe(false);
  expect(password.safeParse("Scout#42").success).toBe(true);
  expect(password.safeParse("Scout adventures begin at sunrise").success).toBe(
    true,
  );
  expect(password.safeParse("كلمة مرور طويلة للمخزن الكشفي").success).toBe(
    true,
  );
});

it("validates public users and strips all fields outside the output allowlist", () => {
  const record = {
    _id: "a".repeat(24),
    name: "Scout",
    email: "scout@test.local",
    role: "SCOUT",
    isActive: true,
    passwordHash: "secret",
    tokenHash: "private",
    internalField: "hidden",
  };
  expect(publicUser(record)).toEqual({
    _id: record._id,
    name: record.name,
    email: record.email,
    role: record.role,
    isActive: true,
  });
  expect(() => publicUser({ ...record, role: "ROOT" })).toThrow(
    "Invalid public user response",
  );
});

it("returns generic internal errors and records safe server-side diagnostics", async () => {
  const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
  const warningLog = vi.spyOn(logger, "warn").mockImplementation(() => {});
  const server = express();
  server.get("/internal", () => {
    throw Object.assign(new Error("database password=secret\nPRIVATE"), {
      status: 400,
    });
  });
  server.get("/expected", () => {
    throw new AppError(409, "Record is in use");
  });
  server.use(errorHandler);
  const internal = await request(server).get("/internal");
  expect(internal.status).toBe(500);
  expect(internal.body).toEqual({
    error: { message: "An internal error occurred" },
  });
  expect(errorLog).toHaveBeenCalledOnce();
  expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/secret|PRIVATE/);
  expect(errorLog.mock.calls[0][0].errorId).toBeTruthy();
  expect((await request(server).get("/expected")).body.error.message).toBe(
    "Record is in use",
  );
  expect(warningLog).toHaveBeenCalledOnce();
});

it("limits CORS to configured origins and retains security headers", async () => {
  const allowed = await request(app)
    .options("/api/v1/equipment")
    .set("Origin", "http://localhost:3000")
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
  expect(allowed.status).toBe(204);
  expect(allowed.headers["access-control-allow-origin"]).toBe(
    "http://localhost:3000",
  );
  expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
  const hostile = await request(app)
    .options("/api/v1/equipment")
    .set("Origin", "https://evil.test")
    .set("Access-Control-Request-Method", "POST");
  expect(hostile.headers["access-control-allow-origin"]).toBeUndefined();
  const page = await request(app).get("/login.html");
  expect(page.headers["x-content-type-options"]).toBe("nosniff");
  expect(page.headers["content-security-policy"]).toContain(
    "script-src 'self'",
  );
  expect(page.headers["x-frame-options"]).toBe("DENY");
});

it("blocks directories, source files and sensitive files and rejects oversized/malformed bodies", async () => {
  for (const path of [
    "/.env",
    "/.git/config",
    "/vercel.json",
    "/js/api.js",
    "/js/",
    "/css/",
    "/dist/",
    "/dist/chunks/",
  ])
    expect((await request(app).get(path)).status).toBe(404);
  const large = await request(app)
    .post("/api/v1/auth/login")
    .send({ password: "x".repeat(70_000) });
  expect(large.status).toBe(413);
  expect(large.body.error.message).toBe("Request is too large");
  const malformed = await request(app)
    .post("/api/v1/auth/login")
    .type("json")
    .send('{"password":');
  expect(malformed.status).toBe(400);
  expect(malformed.body.error.message).toBe("Invalid request");
});
