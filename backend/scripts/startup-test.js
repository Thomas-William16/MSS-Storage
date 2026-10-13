import "./test-env.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { User } from "../src/models/index.js";
import { once } from "node:events";
const replica = await MongoMemoryReplSet.create({
  binary: { version: "7.0.24", checkMD5: true },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
let child;
const uri = replica.getUri("scout_storage_startup_test"),
  base = "http://127.0.0.1:3100";
async function start() {
  child = spawn(process.execPath, ["backend/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: uri,
      PORT: "3100",
      FRONTEND_URL: "https://storage.example.test",
      PUBLIC_APP_URL: "https://storage.example.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", () => {});
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("Backend exited during startup");
    try {
      const r = await fetch(`${base}/health`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Backend readiness timeout");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  const [code] = await exit;
  clearTimeout(timer);
  assert.equal(code, 0, "Graceful shutdown must succeed");
}
try {
  await start();
  await mongoose.connect(uri);
  const password = crypto.randomBytes(24).toString("hex");
  await User.create({
    name: "Startup test administrator",
    email: "startup@test.local",
    role: "ADMIN",
    passwordHash: await bcrypt.hash(password, 12),
  });
  await mongoose.disconnect();
  const login = await fetch(`${base}/login.html`);
  assert.equal(login.status, 200);
  assert.ok((await login.text()).includes("login-form"));
  const protectedResponse = await fetch(`${base}/api/v1/equipment`);
  assert.equal(protectedResponse.status, 401);
  const signedIn = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://storage.example.test",
    },
    body: JSON.stringify({ email: "startup@test.local", password }),
  });
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie");
  assert.ok(cookie.includes("Secure"));
  assert.ok(cookie.includes("HttpOnly"));
  const credentials = await signedIn.json();
  await stop();
  await start();
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const me = await fetch(`${base}/api/v1/auth/me`, {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.user.email, "startup@test.local");
  const loggedOut = await fetch(`${base}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: cookie.split(";")[0],
      Origin: "https://storage.example.test",
      "X-CSRF-Token": credentials.data.csrfToken,
    },
  });
  assert.equal(loggedOut.status, 200);
  await stop();
  console.log(
    "Production entry-point startup test passed: replica-set/index initialization, health ping, real static page, protected API, production Secure/HttpOnly cookies, session persistence, CSRF logout, graceful shutdown and restart.",
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  await mongoose.disconnect();
  await replica.stop();
}
