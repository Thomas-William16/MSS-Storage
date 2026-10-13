import mongoose from "mongoose";
import { app } from "./src/app.js";
import { config } from "./src/config/env.js";
import { connectDatabase } from "./src/config/database.js";
import { logger } from "./src/utils/logger.js";
try {
  await connectDatabase();
  const server = app.listen(config.port, "0.0.0.0", () =>
    logger.info({ port: config.port }, "Scout Storage started"),
  );
  server.on("error", async (error) => {
    logger.error({ code: error.code }, "HTTP listener failed");
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timer);
      process.exit(0);
    });
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  logger.error(
    { name: error.name },
    "Startup failed. Verify MongoDB connectivity and replica-set configuration.",
  );
  process.exitCode = 1;
}
