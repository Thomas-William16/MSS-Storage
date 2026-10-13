import { spawn } from "node:child_process";
import { once } from "node:events";
import mongoose from "mongoose";
import assert from "node:assert/strict";
let child, probe;
const base = "http://127.0.0.1:3101",
  uri = "mongodb://127.0.0.1:27018/scout_storage_local?replicaSet=testset";
async function start() {
  child = spawn(process.execPath, ["backend/scripts/local.js"], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3101",
      FRONTEND_URL: base,
      PUBLIC_APP_URL: base,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null)
      throw new Error(`Local development launcher exited: ${logs}`);
    try {
      const r = await fetch(`${base}/health`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local development readiness timeout");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exit;
  clearTimeout(timer);
}
try {
  await start();
  await mongoose.connect(uri);
  probe = new mongoose.Types.ObjectId();
  await mongoose.connection.db
    .collection("setupchecks")
    .insertOne({ _id: probe, purpose: "development-restart-validation" });
  await mongoose.disconnect();
  await stop();
  await start();
  await mongoose.connect(uri);
  assert.ok(
    await mongoose.connection.db
      .collection("setupchecks")
      .findOne({ _id: probe }),
    "Local database must retain data across restarts",
  );
  await mongoose.connection.db
    .collection("setupchecks")
    .deleteOne({ _id: probe });
  probe = undefined;
  await mongoose.disconnect();
  await stop();
  console.log(
    "Local development startup passed: real health request and database data retained across a stop/restart. Temporary verification record removed.",
  );
} finally {
  if (probe && mongoose.connection.readyState === 1)
    await mongoose.connection.db
      .collection("setupchecks")
      .deleteOne({ _id: probe });
  await mongoose.disconnect();
  await stop();
}
