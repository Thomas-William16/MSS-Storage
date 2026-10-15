import "./test-env.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24", checkMD5: true },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
try {
  process.env.MONGODB_URI = replica.getUri("serverless_verification");
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "scout.example.test";
  delete process.env.FRONTEND_URL;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.RENDER_EXTERNAL_URL;
  const { default: handler } = await import("../../api/index.js");
  const { config } = await import("../src/config/env.js");
  assert.equal(config.publicUrl, "https://scout.example.test");
  assert.deepEqual(config.origins, ["https://scout.example.test"]);
  const gateway = express();
  gateway.use(handler);
  // A concurrent first burst must share the same initialization/pool.
  const cold = await Promise.all(
    Array.from({ length: 8 }, () => request(gateway).get("/health")),
  );
  for (const response of cold) assert.equal(response.status, 200);
  for (const path of ["/login.html", "/css/style.css", "/js/app.js"]) {
    assert.equal((await request(gateway).get(path)).status, 200);
  }
  assert.equal((await request(gateway).get("/api/v1/equipment")).status, 401);
  assert.equal((await request(gateway).get("/missing.html")).status, 404);
  const { User } = await import("../src/models/index.js");
  const password = crypto.randomBytes(24).toString("hex");
  await User.create({
    name: "Serverless fixture",
    email: "serverless@test.local",
    role: "ADMIN",
    passwordHash: await bcrypt.hash(password, 12),
  });
  const signed = await request(gateway)
    .post("/api/v1/auth/login")
    .set("Origin", config.publicUrl)
    .send({ email: "serverless@test.local", password });
  assert.equal(signed.status, 200);
  const cookie = signed.headers["set-cookie"][0];
  assert.ok(cookie.includes("Secure") && cookie.includes("HttpOnly"));
  const session = cookie.split(";")[0];
  assert.equal(
    (await request(gateway).get("/api/v1/equipment").set("Cookie", session))
      .status,
    200,
  );
  assert.equal(
    (
      await request(gateway)
        .post("/api/v1/auth/logout")
        .set("Cookie", session)
        .set("Origin", config.publicUrl)
        .set("X-CSRF-Token", signed.body.data.csrfToken)
    ).status,
    200,
  );
  assert.equal(
    (await request(gateway).get("/api/v1/auth/me").set("Cookie", session))
      .status,
    401,
  );
  console.log(
    "Serverless handler passed: concurrent cold start, Atlas-compatible replica set, hosted HTTPS origin, pages/assets, protected API, Secure/HttpOnly login and CSRF logout.",
  );
} finally {
  await mongoose.disconnect();
  await replica.stop();
}
