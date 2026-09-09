import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .yarn holds the vendored Yarn 4 release binary -- not our source.
  { ignores: ["dist/**", "node_modules/**", ".yarn/**", "src/dev/**/*.d.ts"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript resolves globals; core no-undef only produces false positives here.
      "no-undef": "off",

      // The plan's hard rule: nothing crossing the RPC boundary stays untyped.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // `x != null` is the idiomatic null-or-undefined check and is exactly what
      // optional chaining produces; everything else must be strict.
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // The dev harness legitimately logs and stands in for typed Decky internals.
  {
    files: ["src/dev/**/*.{ts,tsx}"],
    rules: { "no-console": "off" },
  },

  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
