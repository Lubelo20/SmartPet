import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `const { id: _id, ...rest } = row` is how the mapping layer drops a
      // field on purpose. A leading underscore marks that intent.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Git-ignored scratch worktrees — not this project's source.
      ".claude/**",
      // The Python training pipeline. Its virtualenv contains vendored JS
      // (TensorBoard) that eslint would otherwise crawl into.
      "ml/**",
      // Trained model artefacts served statically.
      "public/models/**",
    ],
  },
];

export default eslintConfig;
