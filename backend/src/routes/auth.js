import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { rateLimit, MemoryStore } from "express-rate-limit";
import { User, Session } from "../models/index.js";
import { z, str, body } from "../middleware/validation.js";
import {
  authenticate,
  csrf,
  hash,
  cookieOptions,
} from "../middleware/security.js";
import { config } from "../config/env.js";
import { fail } from "../utils/errors.js";
import { transaction, audit } from "../services/common.js";
import { sharedLoginLimit } from "../middleware/login-limit.js";
import { publicUser } from "../middleware/output.js";
export const auth = Router();
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);
export const loginStore = new MemoryStore();
const loginLimit = rateLimit({
  store: loginStore,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { message: "Too many login attempts. Try again later." } },
});
auth.post(
  "/login",
  loginLimit,
  csrf,
  body(
    z.strictObject({
      email: z
        .email()
        .max(254)
        .transform((x) => x.toLowerCase()),
      password: z
        .string()
        .min(1)
        .max(72)
        .refine((value) => Buffer.byteLength(value) <= 72),
    }),
  ),
  sharedLoginLimit,
  async (req, res) => {
    const user = await User.findOne({ email: req.input.email }).select(
      "+passwordHash",
    );
    const valid = await bcrypt.compare(
      req.input.password,
      user?.passwordHash || dummyHash,
    );
    if (!valid || !user?.isActive) fail(401, "Invalid email or password");
    const token = crypto.randomBytes(32).toString("hex"),
      csrfToken = crypto.randomBytes(32).toString("hex");
    await transaction(async (session) => {
      if (
        typeof req.cookies.session === "string" &&
        /^[a-f\d]{64}$/i.test(req.cookies.session)
      )
        await Session.deleteOne({
          tokenHash: hash(req.cookies.session),
        }).session(session);
      await Session.create(
        [
          {
            user: user._id,
            tokenHash: hash(token),
            csrf: csrfToken,
            expiresAt: new Date(Date.now() + config.sessionHours * 3600000),
          },
        ],
        { session },
      );
      await audit(user, "LOGIN", "User", user._id, {}, session);
    });
    res.cookie("session", token, cookieOptions());
    const safe = publicUser(user);
    res.json({ data: { user: safe, csrfToken } });
  },
);
auth.get("/me", authenticate, (req, res) =>
  res.json({
    data: { user: publicUser(req.user), csrfToken: req.session.csrf },
  }),
);
auth.post("/logout", authenticate, csrf, async (req, res) => {
  await transaction(async (session) => {
    await Session.deleteOne({ _id: req.session._id }).session(session);
    await audit(req.user, "LOGOUT", "User", req.user._id, {}, session);
  });
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie("session", options);
  res.json({ data: { message: "Signed out" } });
});
