import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
  // Define files ESLint should NOT lint
  ignores: [
      "dist/",
      "build/",
      ".next/",
      "coverage/",
      "node_modules/",
      "out"
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020
      }
    }
  },
  {
    files: ["**/test/**/*.{js,ts}", "**/*.test.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha
      }
    }
  },
  {
    rules: {
      // --- THE CORE FIXES FOR UNUSED VARS ---

      // A. IMPORTANT: Disable the base ESLint rule, as @typescript-eslint provides its own.
      'no-unused-vars': 'off',

      // B. Configure the @typescript-eslint/no-unused-vars rule with ignore patterns
      '@typescript-eslint/no-unused-vars': [
        'error', // Set to 'error' to fail the build, or 'warn' if you prefer warnings
        {
          'argsIgnorePattern': '^_',           // Ignore unused function arguments starting with _
          'varsIgnorePattern': '^_',           // Ignore unused variables starting with _
          'caughtErrorsIgnorePattern': '^_',   // Ignore unused variables in catch clauses starting with _
          // You might also want: 'destructuredArrayIgnorePattern': '^_',
          // or 'ignoreRestSiblings': true (useful for object destructuring)
        },
      ],

      // --- Other rules for your project ---
      // 'no-console': 'warn',
      // 'indent': ['error', 2],
      // etc.
    }
  },
];
