import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    // Nested git worktrees hold a full copy of the tree, so the include
    // pattern collects their tests too and every count doubles.
    exclude: [...configDefaults.exclude, "**/.next/**", "**/.claude/worktrees/**"],
  },
});
