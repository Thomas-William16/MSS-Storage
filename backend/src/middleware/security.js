import crypto from "node:crypto";
import { Session, User } from "../models/index.js";
import { fail } from "../utils/errors.js";
import { config } from "../config/env.js";
export const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const permissionMatrix = {
  inventory: ["ADMIN", "STORAGE_KEEPER", "LEADER", "SCOUT"],
  manageInventory: ["ADMIN", "STORAGE_KEEPER"],
  borrow: ["ADMIN", "STORAGE_KEEPER"],
  requests: ["ADMIN", "STORAGE_KEEPER", "LEADER", "SCOUT"],
  reviewRequests: ["ADMIN", "STORAGE_KEEPER"],
  maintenance: ["ADMIN", "STORAGE_KEEPER"],
  reportDamage: ["ADMIN", "STORAGE_KEEPER", "LEADER", "SCOUT"],
  reports: ["ADMIN", "STORAGE_KEEPER"],
  users: ["ADMIN"],
  taxonomy: ["ADMIN"],
  audit: ["ADMIN"],
};
export const operational = (user) =>
  ["ADMIN", "STORAGE_KEEPER"].includes(user.role);
export async function authenticate(req, res, next) {
  const token = req.cookies?.session;
  if (!token || typeof token !== "string" || token.length > 200)
    fail(401, "Authentication required");
  const session = await Session.findOne({
    tokenHash: hash(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) fail(401, "Session expired");
  const user = await User.findById(session.user);
  if (!user?.isActive) fail(401, "Account unavailable");
  req.user = user;
  req.session = session;
  next();
}
export const permit = (permission) => (req, res, next) => {
  if (!permissionMatrix[permission]?.includes(req.user.role))
    fail(403, "Permission denied");
  next();
};
export function csrf(req, res, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.headers.origin || !config.origins.includes(req.headers.origin))
      fail(403, "Untrusted origin");
    if (!(req.baseUrl === "/api/v1/auth" && req.path === "/login")) {
      const token = req.headers["x-csrf-token"];
      if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token) ||
        !req.session ||
        token.length !== req.session.csrf.length ||
        !crypto.timingSafeEqual(
          Buffer.from(token),
          Buffer.from(req.session.csrf),
        )
      )
        fail(403, "Invalid CSRF token");
    }
  }
  next();
}
export function own(record, user, field = "user") {
  if (
    !operational(user) &&
    String(record[field]?._id || record[field]) !== String(user._id)
  )
    fail(403, "Permission denied");
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: config.production,
  sameSite: config.sameSite,
  path: "/api/v1",
  maxAge: config.sessionHours * 3600000,
});
