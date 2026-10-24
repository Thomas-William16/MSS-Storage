import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { User, AuditLog } from "../src/models/index.js";
import { transaction } from "../src/services/common.js";
import { password, parse, z, str } from "../src/middleware/validation.js";
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
try {
  const name = await rl.question("Administrator name: "),
    email = await rl.question("Administrator email: ");
  if (!process.stdin.isTTY)
    throw new Error("Use an interactive terminal for secure password entry");
  process.stdout.write("Password (at least 8 characters; hidden): ");
  muted = true;
  const plain = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  parse(z.strictObject({ name: str(100).min(1), email: z.email(), password }), {
    name,
    email,
    password: plain,
  });
  await connectDatabase();
  const passwordHash = await bcrypt.hash(plain, 12);
  await transaction(async (session) => {
    // One singleton counter locks concurrent bootstrap attempts.
    const { Counter } = await import("../src/models/index.js");
    await Counter.findOneAndUpdate(
      { _id: "admin-bootstrap" },
      { $inc: { value: 1 } },
      { upsert: true, session },
    );
    if (await User.exists({ role: "ADMIN" }).session(session))
      throw new Error(
        "Administrator already exists; use the admin user-management page",
      );
    const [user] = await User.create(
      [{ name, email: email.toLowerCase(), passwordHash, role: "ADMIN" }],
      { session },
    );
    await AuditLog.create(
      [
        {
          user: user._id,
          action: "ADMIN_BOOTSTRAPPED",
          entity: "User",
          entityId: user._id,
        },
      ],
      { session },
    );
  });
  console.log("Administrator created.");
} catch (error) {
  console.error(
    error.code === 11000 ? "Account already exists" : error.message,
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
