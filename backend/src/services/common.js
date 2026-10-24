import mongoose from "mongoose";
import { AuditLog } from "../models/index.js";
import { fail } from "../utils/errors.js";
import { publicUser } from "../middleware/output.js";
export async function transaction(work) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
export async function audit(user, action, entity, entityId, details, session) {
  await AuditLog.create(
    [{ user: user?._id, action, entity, entityId, details }],
    { session },
  );
}
export async function found(model, id, session) {
  const record = await model.findById(id).session(session || null);
  if (!record) fail(404, "Record not found");
  return record;
}
export async function list(model, filter, paging, populate = []) {
  const query = model
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((paging.page - 1) * paging.limit)
    .limit(paging.limit);
  const publicUserPaths = new Set([
    "user",
    "borrowedBy",
    "requestedBy",
    "approvedBy",
    "reportedBy",
    "history.user",
  ]);
  for (const path of populate)
    query.populate(
      typeof path === "string" && publicUserPaths.has(path)
        ? { path, select: "name role" }
        : path,
    );
  const [data, total] = await Promise.all([
    query.lean(),
    model.countDocuments(filter),
  ]);
  return {
    data: model.modelName === "User" ? data.map(publicUser) : data,
    meta: {
      page: paging.page,
      limit: paging.limit,
      total,
      pages: Math.ceil(total / paging.limit),
    },
  };
}
export const searchRegex = (value) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

export async function reference(model, id, session) {
  const record = await model.findOneAndUpdate(
    { _id: id },
    { $inc: { revision: 1 } },
    { new: true, session },
  );
  if (!record) fail(404, "Referenced record not found");
  return record;
}
