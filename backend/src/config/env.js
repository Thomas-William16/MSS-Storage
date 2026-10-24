import "dotenv/config";
const preview = process.env.VERCEL_ENV === "preview";
const branchUrl =
  preview && process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : undefined;
const vercelUrl = preview
  ? process.env.VERCEL_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const hostedUrl =
  process.env.RENDER_EXTERNAL_URL ||
  (vercelUrl ? `https://${vercelUrl}` : undefined);
const frontendUrl = preview
  ? [hostedUrl, branchUrl].filter(Boolean).join(",") || undefined
  : process.env.FRONTEND_URL || hostedUrl;
const publicUrl = preview
  ? branchUrl || hostedUrl
  : process.env.PUBLIC_APP_URL || hostedUrl;
export const config = {
  production: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 3000),
  mongo: process.env.MONGODB_URI,
  // Previews never use the database selected by the inherited production URI.
  databaseName: preview ? "scout_storage_preview" : undefined,
  origins: (frontendUrl || "http://localhost:3000")
    .split(",")
    .map((x) => new URL(x.trim()).origin),
  publicUrl: publicUrl || "http://localhost:3000",
  sameSite: process.env.COOKIE_SAME_SITE || "lax",
  sessionHours: 8,
};
if (!["lax", "strict", "none"].includes(config.sameSite))
  throw new Error("Invalid COOKIE_SAME_SITE");
if (
  config.production &&
  (!frontendUrl ||
    !publicUrl ||
    !config.origins.every((x) => x.startsWith("https://")) ||
    !config.publicUrl.startsWith("https://"))
)
  throw new Error("Production requires HTTPS FRONTEND_URL and PUBLIC_APP_URL");

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
  throw new Error("Invalid PORT");
if (!config.origins.every((origin) => /^https?:\/\//.test(origin)))
  throw new Error("FRONTEND_URL must contain HTTP(S) origins");
const publicAddress = new URL(config.publicUrl);
if (!["https:", "http:"].includes(publicAddress.protocol))
  throw new Error("PUBLIC_APP_URL must be HTTP(S)");
