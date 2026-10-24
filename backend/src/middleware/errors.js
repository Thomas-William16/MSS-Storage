import { randomUUID } from "node:crypto";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let message = "An internal error occurred";
  if (
    error instanceof AppError &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 500
  ) {
    status = error.status;
    message = error.message;
  } else if (error.code === 11000) {
    status = 409;
    message = "A unique value already exists";
  } else if (
    ["ValidationError", "CastError", "StrictModeError"].includes(error.name) ||
    error.type === "entity.parse.failed"
  ) {
    status = 400;
    message = "Invalid request";
  } else if (error.type === "entity.too.large") {
    status = 413;
    message = "Request is too large";
  } else if (error.status === 415) {
    status = 415;
    message = "Unsupported request encoding";
  }
  const errorId = randomUUID();
  const details = {
    errorId,
    name: error.name,
    code: error.code,
    method: req.method,
    path: req.path,
    status,
    // Keep stack locations for debugging without recording messages or bodies.
    frames:
      status >= 500
        ? error.stack
            ?.split("\n")
            .filter((line) => /^\s+at /.test(line))
            .slice(0, 8)
            .join("\n")
        : undefined,
  };
  if (status >= 500) logger.error(details, "Request failed");
  else logger.warn(details, "Request rejected");
  res.status(status).json({ error: { message } });
}
