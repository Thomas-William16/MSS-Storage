// Test processes must never inherit production origins, cookie policy or a database URI.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/isolated_test_only";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PUBLIC_APP_URL = "http://localhost:3000";
process.env.COOKIE_SAME_SITE = "lax";
process.env.TRUST_PROXY = "0";
