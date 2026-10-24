import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Build locally with production settings; never deploy or connect to a database.
process.env.VERCEL_ENV = "production";
await import("./build-vercel.js");
const manifest = JSON.parse(
  await readFile("public/manifest.webmanifest", "utf8"),
);
assert.equal(manifest.id, "/");
assert.equal(manifest.start_url, "/dashboard.html");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
for (const size of ["192x192", "512x512"])
  assert.ok(manifest.icons.some((icon) => icon.sizes === size));
for (const icon of manifest.icons) await readFile(`public${icon.src}`);

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    const path = `${directory}/${entry.name}`;
    assert.ok(!entry.name.startsWith("."), `Private artifact: ${path}`);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(js|html|css|webmanifest)$/.test(entry.name)) {
      const contents = await readFile(path, "utf8");
      for (const marker of [
        "_vercel_share=",
        "preview@scout-storage.test",
        "__PREVIEW__",
      ])
        assert.ok(
          !contents.includes(marker),
          `Private preview detail or uncompiled flag in ${path}`,
        );
    }
  }
}
await inspect("public");
assert.ok(
  !(await readFile("public/dist/app.js", "utf8")).includes("preview-notice"),
  "Production must not render the preview account notice",
);
console.log(
  "Production packaging passed: install metadata present; preview notice and private access excluded. Nothing deployed.",
);
