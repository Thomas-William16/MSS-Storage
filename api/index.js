import bcrypt from "bcryptjs";
import { app } from "../backend/src/app.js";
import { connectDatabase } from "../backend/src/config/database.js";
import { User, Counter, AuditLog } from "../backend/src/models/index.js";
import { transaction } from "../backend/src/services/common.js";
import {
  parse,
  z,
  password as passwordSchema,
} from "../backend/src/middleware/validation.js";
import { logger } from "../backend/src/utils/logger.js";

let databaseReady;

async function initializeFirstAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) return;
  if (await User.exists({ role: "ADMIN" })) return;

  parse(
    z.strictObject({ email: z.email(), password: passwordSchema }),
    { email, password },
  );

  const passwordHash = await bcrypt.hash(password, 12);

  await transaction(async (session) => {
    await Counter.findOneAndUpdate(
      { _id: "admin-bootstrap" },
      { $inc: { value: 1 } },
      { upsert: true, session },
    );

    if (await User.exists({ role: "ADMIN" }).session(session)) return;

    const [user] = await User.create(
      [{
        name: "Administrator",
        email,
        passwordHash,
        role: "ADMIN",
      }],
      { session },
    );

    await AuditLog.create(
      [{
        user: user._id,
        action: "ADMIN_BOOTSTRAPPED",
        entity: "User",
        entityId: user._id,
      }],
      { session },
    );
  });
}

export default async function handler(req, res) {
  try {
    databaseReady ||= (async () => {
      await connectDatabase();
      await initializeFirstAdmin();
    })().catch((error) => {
      databaseReady = undefined;
      throw error;
    });

    await databaseReady;
  } catch (error) {
    logger.error(
      {
        name: error.name,
        code: error.code,
        codeName: error.codeName,
      },
      "Database initialization failed",
    );
    return res.status(503).json({
      error: { message: "Service temporarily unavailable" },
    });
  }

  return app(req, res);
}
