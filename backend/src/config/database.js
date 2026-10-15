import mongoose from "mongoose";
import { config } from "./env.js";
import * as models from "../models/index.js";
import { migrateLeaderAccounts } from "../services/migrations.js";
export async function connectDatabase(uri = config.mongo) {
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    ...(process.env.VERCEL ? { maxPoolSize: 5 } : {}),
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    await mongoose.disconnect();
    throw new Error(
      "MongoDB replica set or Atlas required for inventory transactions",
    );
  }
  for (const model of Object.values(models))
    if (model?.modelName) await model.init();
  await migrateLeaderAccounts();
}
