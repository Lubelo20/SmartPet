import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Rules tests run against the Firestore emulator, so they are kept out of the
// default `npm test` run (see vitest.config.ts) and driven by `npm run test:rules`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["firestore/__tests__/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
