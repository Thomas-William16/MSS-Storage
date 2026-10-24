import { cp, mkdir, unlink } from "node:fs/promises";
import { pagePaths } from "../shared/page-paths.js";

// Publish only browser artifacts, never source, deployment settings, or secrets.
export async function packageFrontend() {
  await mkdir("public", { recursive: true });
  // Remove stale generated aliases from earlier builds, including local rebuilds.
  for (const page of pagePaths.filter((page) => page !== "index.html"))
    await unlink(`public/${page}`).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  await cp("frontend/index.html", "public/index.html");
  for (const directory of ["css", "dist", "icons"])
    await cp(`frontend/${directory}`, `public/${directory}`, {
      recursive: true,
    });
  await cp("frontend/favicon.svg", "public/favicon.svg");
  await cp("frontend/manifest.webmanifest", "public/manifest.webmanifest");
}
