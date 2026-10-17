import { build, context } from "esbuild";
const options = {
  entryPoints: ["frontend/js/react-app.jsx"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  outfile: "frontend/dist/app.js",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "eof",
};
if (process.argv.includes("--watch")) {
  const compiler = await context(options);
  await compiler.watch();
  console.log("Watching frontend JavaScript for changes.");
} else await build(options);
