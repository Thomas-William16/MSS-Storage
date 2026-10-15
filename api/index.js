import { app } from "../backend/src/app.js";
import { connectDatabase } from "../backend/src/config/database.js";
import { logger } from "../backend/src/utils/logger.js";

let databaseReady;
export default async function handler(req, res) {
  try {
    // Reuse the database pool and initialization within each warm function instance.
    databaseReady ||= connectDatabase().catch((error) => {
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
    reason: /bad auth|authentication failed|auth failed|SCRAM/i.test(error.message || "")
  ? "authentication_failed"
  : /not authorized|unauthorized|permission denied/i.test(error.message || "")
    ? "permission_denied"
    : "other_database_error",
  },
  "Database initialization failed",
);
    return res
      .status(503)
      .json({ error: { message: "Service temporarily unavailable" } });
  }
  return app(req, res);
}
