import { build, context } from "esbuild";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const options = {
  entryPoints: { app: "frontend/js/react-app.jsx" },
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  outdir: "frontend/dist",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  metafile: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    __PREVIEW__: JSON.stringify(process.env.VERCEL_ENV === "preview"),
  },
  legalComments: "eof",
};
if (process.argv.includes("--watch")) {
  const compiler = await context(options);
  await compiler.watch();
  console.log("Watching frontend JavaScript for changes.");
} else {
  const result = await build(options);
  const initial = new Set();
  function visit(path) {
    if (initial.has(path)) return;
    initial.add(path);
    for (const entry of result.metafile.outputs[path].imports)
      if (entry.kind === "import-statement") visit(entry.path);
  }
  visit("frontend/dist/app.js");
  const files = await Promise.all([...initial].map((path) => readFile(path)));
  const bytes = files.reduce((total, file) => total + file.length, 0);
  const gzip = files.reduce((total, file) => total + gzipSync(file).length, 0);
  console.log(
    `Initial JavaScript: ${bytes} bytes (${gzip} bytes gzip); workflow chunks load on demand.`,
  );
}
