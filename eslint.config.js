// Same narrow scope as claude-synapse's eslint.config.js: only what `tsc --strict`
// can't catch on its own, not a stylistic preset.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A CLI entrypoint (main()) called without await/void would exit silently on an
      // unhandled rejection instead of surfacing as a non-zero exit code.
      "@typescript-eslint/no-floating-promises": "error",
      "no-eval": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:child_process",
              message: "This server never shells out — no legitimate use here. If one appears, use execFile/execFileSync (array args), never exec/execSync.",
            },
          ],
        },
      ],
    },
  },
);
