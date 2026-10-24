import { z } from "zod";
import { fail } from "../utils/errors.js";
export const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");
export const str = (max = 2000) => z.string().trim().max(max);
export const password = z
  .string()
  .min(8)
  .max(72)
  .refine(
    (x) => Buffer.byteLength(x) <= 72,
    "Password exceeds bcrypt byte limit",
  )
  .refine(
    (value) => !/^(.)\1+$/su.test(value),
    "Choose a longer, less predictable passphrase",
  )
  .refine(
    (value) =>
      !new Set([
        "password123456789",
        "123456789012345",
        "qwertyuiop123456",
        "letmein123456789",
      ]).has(value.toLowerCase()),
    "This password is too common",
  );
export const date = z.iso
  .datetime({ offset: true })
  .transform((x) => new Date(x));
export const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success)
    fail(
      400,
      result.error.issues
        .map((x) => `${x.path.join(".") || "body"}: ${x.message}`)
        .join("; "),
      Object.fromEntries(
        result.error.issues
          .filter((issue) => issue.path.length)
          .map((issue) => [issue.path.join("."), issue.message]),
      ),
    );
  return result.data;
};
export const body = (schema) => (req, res, next) => {
  req.input = parse(schema, req.body);
  next();
};
export function pagination(req) {
  return parse(
    z.object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      search: str(100).optional(),
      category: id.optional(),
      status: str(30).optional(),
      from: date.optional(),
      to: date.optional(),
    }),
    req.query,
  );
}
export function pathId(req, res, next) {
  for (const value of Object.values(req.params)) parse(id, value);
  next();
}
export const uniqueIds = z
  .array(id)
  .min(1)
  .max(100)
  .refine((x) => new Set(x).size === x.length, "Duplicate item IDs");
export { z };
