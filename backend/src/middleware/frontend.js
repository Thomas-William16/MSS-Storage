import express from "express";
import { fileURLToPath } from "node:url";
import { pagePaths } from "../../../shared/page-paths.js";

const pageURLs = new Set(["/", ...pagePaths.map((page) => `/${page}`)]);
const source = fileURLToPath(new URL("../../../frontend/", import.meta.url));

// Match only known screens; never turn missing scripts or API paths into HTML.
export function frontendRouter(root = source) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    if (pageURLs.has(req.path))
      return res.sendFile("index.html", {
        root,
        headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
      });
    const asset =
      ["/css/style.css", "/favicon.svg", "/dist/app.js"].includes(req.path) ||
      /^\/dist\/chunks\/[a-zA-Z0-9-]+\.js$/.test(req.path);
    if (!asset) return next();
    serveAssets(req, res, next);
  });
  const serveAssets = express.static(root, {
    index: false,
    dotfiles: "deny",
    redirect: false,
    setHeaders(res, file) {
      const versioned = /\/dist\/chunks\/[^/]+-[A-Z0-9]{8}\.js$/.test(
        file.replaceAll("\\", "/"),
      );
      res.setHeader(
        "Cache-Control",
        versioned
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      );
    },
  });
  return router;
}
