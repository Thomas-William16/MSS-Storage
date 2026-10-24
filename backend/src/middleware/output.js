import { z } from "zod";
import { roles } from "../models/index.js";

const publicUserSchema = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i),
  name: z.string().min(1).max(100),
  email: z.email().max(254),
  phone: z.string().max(40).optional(),
  role: z.enum(roles),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Explicit output allowlist: new model fields never become public by default.
export function publicUser(record) {
  const data = record.toObject ? record.toObject() : record;
  const result = publicUserSchema.safeParse({
    ...data,
    _id: String(data._id),
    createdAt: data.createdAt?.toISOString?.() || data.createdAt,
    updatedAt: data.updatedAt?.toISOString?.() || data.updatedAt,
  });
  if (!result.success) throw new Error("Invalid public user response");
  return result.data;
}
