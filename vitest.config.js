import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./backend/scripts/test-env.js"],
    include: ["backend/tests/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
  },
});
