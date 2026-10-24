import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else if (path.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exit(result.status || 1);
    } else if (path.endsWith(".html")) {
      const html = await readFile(path, "utf8");
      if (!html.includes("<html") || !html.includes("viewport"))
        throw new Error(`Invalid page ${path}`);
    }
  }
}
await walk("backend");
await walk("frontend");
await walk("shared");
await import("./check-architecture.js");
console.log("JavaScript syntax and HTML page checks passed.");
