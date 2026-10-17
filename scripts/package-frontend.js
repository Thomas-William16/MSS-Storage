import { cp, mkdir, readdir } from "node:fs/promises";

// Publish only browser artifacts, never source, deployment settings, or secrets.
export async function packageFrontend() {
  await mkdir("public", { recursive: true });
  for (const entry of await readdir("frontend", { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html"))
      await cp(`frontend/${entry.name}`, `public/${entry.name}`);
  }
  for (const directory of ["css", "dist"])
    await cp(`frontend/${directory}`, `public/${directory}`, {
      recursive: true,
    });
}
