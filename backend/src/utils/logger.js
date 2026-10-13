import pino from "pino";
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: [
    "password",
    "passwordHash",
    "token",
    "cookie",
    "authorization",
    "mongo",
    "MONGODB_URI",
  ],
});
