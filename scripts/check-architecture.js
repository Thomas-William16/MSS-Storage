import { build } from "esbuild";

// Inspect the runtime import graph without executing code or writing artifacts.
const { metafile } = await build({
  entryPoints: [
    "frontend/js/react-app.jsx",
    "backend/src/app.js",
    "api/index.js",
  ],
  outdir: ".architecture-check",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  metafile: true,
  write: false,
  logLevel: "silent",
});

const graph = new Map();
const violations = [];
for (const [source, input] of Object.entries(metafile.inputs)) {
  const dependencies = input.imports
    .filter((entry) => !entry.external)
    .map((entry) => entry.path);
  graph.set(source, dependencies);
  for (const target of dependencies) {
    if (
      source.startsWith("frontend/") &&
      (target.startsWith("backend/") || target.startsWith("api/"))
    )
      violations.push(
        `Browser code must not import server code: ${source} → ${target}`,
      );
    if (
      (source.startsWith("backend/") || source.startsWith("api/")) &&
      target.startsWith("frontend/")
    )
      violations.push(
        `Server code must use shared contracts, not frontend modules: ${source} → ${target}`,
      );
    if (source.startsWith("shared/") && !target.startsWith("shared/"))
      violations.push(
        `Shared contracts must not depend on application layers: ${source} → ${target}`,
      );
    if (
      source.startsWith("backend/src/services/") &&
      /backend\/src\/(routes|middleware)\//.test(target)
    )
      violations.push(
        `Business services must not depend on HTTP handlers: ${source} → ${target}`,
      );
    if (
      /frontend\/js\/(ui|hooks|utils)\//.test(source) &&
      /frontend\/js\/[^/]+-pages\.jsx$/.test(target)
    )
      violations.push(
        `Reusable frontend modules must not import feature pages: ${source} → ${target}`,
      );
    if (source.startsWith("frontend/js/ui/") && target === "frontend/js/ui.jsx")
      violations.push(
        `UI implementations must not import their own facade: ${source} → ${target}`,
      );
  }
}

const visited = new Set();
const active = new Set();
function visit(source, trail = []) {
  if (active.has(source)) {
    violations.push(`Circular import: ${[...trail, source].join(" → ")}`);
    return;
  }
  if (visited.has(source)) return;
  active.add(source);
  for (const target of graph.get(source) || [])
    visit(target, [...trail, source]);
  active.delete(source);
  visited.add(source);
}
for (const source of graph.keys()) visit(source);
if (violations.length) throw new Error(violations.join("\n"));
console.log(
  `Architecture checks passed (${graph.size} runtime modules; no circular imports or layer violations).`,
);
