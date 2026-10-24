import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit, MemoryStore } from "express-rate-limit";
import { frontendRouter } from "./middleware/frontend.js";
import { config } from "./config/env.js";
import { authenticate, csrf } from "./middleware/security.js";
import { auth } from "./routes/auth.js";
import { catalog } from "./routes/catalog.js";
import { workflows } from "./routes/workflows.js";
import { reports } from "./routes/reports.js";
import { errorHandler } from "./middleware/errors.js";
export const app = express();
app.disable("x-powered-by");
// Authenticated responses must never enter browser or shared HTTP caches.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
const hops = Number(process.env.TRUST_PROXY || 0);
if (!Number.isInteger(hops) || hops < 0) throw new Error("Invalid TRUST_PROXY");
if (hops) app.set("trust proxy", hops);
app.use(
  helmet({
    frameguard: { action: "deny" },
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
  res.set("Cache-Control", "no-store");
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
app.use(frontendRouter());
app.use((req, res) =>
  res.status(404).json({ error: { message: "Not found" } }),
);
app.use(errorHandler);
