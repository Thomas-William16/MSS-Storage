import { mkdir } from "node:fs/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
if (process.env.NODE_ENV === "production")
  throw new Error("Local development database cannot run in production");
const dir = path.resolve(".local-db");
await mkdir(dir, { recursive: true });
const replica = await MongoMemoryReplSet.create({
  binary: {
    version: "7.0.24",
    checkMD5: true,
    downloadDir:
      process.env.MONGOMS_DOWNLOAD_DIR || path.resolve("../.mongodb-binaries"),
  },
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27018, dbPath: dir }],
});
const uri = replica.getUri("scout_storage_local");
console.log(
  "Local development replica set ready. To bootstrap the first admin, set MONGODB_URI in your ignored .env to:",
);
console.log(uri);
const child = spawn(process.execPath, ["backend/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    MONGODB_URI: uri,
    PORT: process.env.PORT || "3000",
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || "http://localhost:3000",
  },
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit").catch(() => {});
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    await exited;
    clearTimeout(timer);
  }
  await replica.stop();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
child.on("exit", (code) => stop(code || 0));

child.on("error", () => stop(1));
