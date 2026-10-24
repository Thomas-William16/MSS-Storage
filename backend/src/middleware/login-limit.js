import { LoginAttempt } from "../models/index.js";
import { hash } from "./security.js";
import { fail } from "../utils/errors.js";

const windowMs = 15 * 60 * 1000;
export async function sharedLoginLimit(req, res, next) {
  const window = Math.floor(Date.now() / windowMs);
  const expiresAt = new Date((window + 1) * windowMs);
  // Store only hashed identifiers; counters expire and work across instances.
  for (const [kind, value, limit] of [
    ["ip", req.ip, 100],
    ["account", req.input.email, 20],
  ]) {
    const _id = hash(`${kind}:${value}:${window}`);
    const update = () =>
      LoginAttempt.findOneAndUpdate(
        { _id },
        { $inc: { attempts: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      );
    let counter;
    try {
      counter = await update();
    } catch (error) {
      // Concurrent first attempts can race on the unique key during upsert.
      if (error.code !== 11000) throw error;
      counter = await update();
    }
    if (counter.attempts > limit) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))),
      );
      fail(429, "Too many login attempts. Try again later.");
    }
  }
  next();
}
