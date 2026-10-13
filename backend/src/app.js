import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit, MemoryStore } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config/env.js";
import { authenticate, csrf } from "./middleware/security.js";
import { auth } from "./routes/auth.js";
import { catalog } from "./routes/catalog.js";
import { workflows } from "./routes/workflows.js";
import { reports } from "./routes/reports.js";
import { logger } from "./utils/logger.js";
export const app = express();
app.disable("x-powered-by");
const hops = Number(process.env.TRUST_PROXY || 0);
if (!Number.isInteger(hops) || hops < 0) throw new Error("Invalid TRUST_PROXY");
if (hops) app.set("trust proxy", hops);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'", ...config.origins],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, cb) =>
      cb(null, !origin || config.origins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.get("/health", async (req, res) => {
  let ready = mongoose.connection.readyState === 1;
  if (ready)
    try {
      await mongoose.connection.db.admin().ping();
    } catch {
      ready = false;
    }
  res
    .status(ready ? 200 : 503)
    .json({ data: { status: ready ? "ok" : "unavailable" } });
});
export const apiStore = new MemoryStore();
app.use(
  "/api/v1",
  rateLimit({
    store: apiStore,
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Request rate exceeded" } },
  }),
);
app.use("/api/v1/auth", auth);
app.use("/api/v1", authenticate, csrf, catalog, workflows, reports);
app.use("/api", (req, res) =>
  res.status(404).json({ error: { message: "Endpoint not found" } }),
);
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../frontend",
);
app.use(express.static(frontend, { index: "index.html" }));
app.use((req, res) =>
  res.status(404).json({ error: { message: "Not found" } }),
);
app.use((error, req, res, next) => {
  let status = error.status || 500,
    message = error.message;
  if (error.code === 11000) {
    status = 409;
    message = "A unique value already exists";
  } else if (
    error.name === "ValidationError" ||
    error.name === "CastError" ||
    error.type === "entity.parse.failed"
  ) {
    status = 400;
    message = "Invalid request";
  }
  if (status >= 500) {
    logger.error(
      { name: error.name, code: error.code, path: req.path },
      "Request failed",
    );
    message = "An internal error occurred";
  }
  res.status(status).json({ error: { message } });
});
