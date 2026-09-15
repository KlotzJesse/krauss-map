import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

// Ultracite 7 ships its presets as JS modules. The old .oxlintrc.json extended
// "./node_modules/ultracite/config/oxlint/*/.oxlintrc.json", files that no
// longer exist, so `bun run lint` failed before linting anything.
export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [...(core.ignorePatterns ?? []), "node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "kraussSchema.ts", ".next2/**", ".claude/**", ".agents/**", ".action-shots/**"],
  env: { builtin: true },
  overrides: [
    ...(core.overrides ?? []),
    {
      // Workers run in their own global scope: top-level functions are not
      // window globals, and a worker's postMessage(message, transfer) has no
      // target origin to pass — neither does Worker#postMessage on the page side.
      files: ["**/*.worker.ts", "src/lib/hooks/use-postal-style-state.ts"],
      rules: {
        "no-implicit-globals": "off",
        "unicorn/require-post-message-target-origin": "off",
      },
    },
  ],
  rules: {
    // Style rules from the Ultracite 7 presets that this codebase has never
    // followed. Turning them on produced ~1,000 findings that change nothing at
    // runtime and buried the ones that do (refs read during render, effects that
    // set state, floating promises). Enable them deliberately, with an autofix
    // pass, rather than by upgrading a preset.
    "curly": "off",
    "react/function-component-definition": "off",
    "require-unicode-regexp": "off",
    "prefer-named-capture-group": "off",
    "prefer-arrow-callback": "off",
    "sort-vars": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/switch-case-braces": "off",
    "unicorn/consistent-existence-index-check": "off",
    "unicorn/prefer-number-coercion": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/prefer-add-event-listener": "off",
    "unicorn/no-useless-undefined": "off",
    "typescript/array-type": "off",
    "typescript/consistent-type-definitions": "off",
    "typescript/no-unnecessary-type-arguments": "off",
    "import/consistent-type-specifier-style": "off",
    // Its autofix deletes `export {}`, which is what lets a bun script use
    // top-level await under TypeScript.
    "unicorn/require-module-specifiers": "off",
    // Reported, not failed. Every remaining hit of these was reviewed after the
    // Ultracite 7 upgrade and is deliberate:
    // - no-await-in-loop: DB writes inside a transaction and browser test steps
    //   must run in order; a transaction client cannot run queries in parallel.
    // - React Compiler advisories: identity-preserving memos that read a
    //   previous-value ref, cache-loading effects that set state once, and
    //   try/finally blocks the compiler cannot lower yet. Fixing them means
    //   restructuring working code; new hits should still be looked at.
    // - jsx-a11y: existing interactive widgets (drag rows, context menus) whose
    //   markup is shared with base-ui primitives.
    // - TypeScript strictness that fights ordinary React: effects that return a
    //   cleanup on only some paths (consistent-return), async handlers passed to
    //   onClick (strict-void-return), and template strings built from unknown
    //   values in dev scripts. Floating promises stay an error.
    "typescript/consistent-return": "warn",
    "typescript/strict-void-return": "warn",
    "typescript/restrict-template-expressions": "warn",
    "typescript/no-base-to-string": "warn",
    "typescript/no-misused-spread": "warn",
    "no-await-in-loop": "warn",
    "react/refs": "warn",
    "react/set-state-in-effect": "warn",
    "react/todo": "warn",
    "react/memo-dependencies": "warn",
    "react/exhaustive-effect-dependencies": "warn",
    "react/rule-suppression": "warn",
    "react/hook-use-state": "warn",
    "react/preserve-manual-memoization": "warn",
    "react/use-memo": "warn",
    "react/no-deriving-state-in-effects": "warn",
    "react/capitalized-calls": "warn",
    "react-hooks/exhaustive-deps": "warn",
    "jsx-a11y/prefer-tag-over-role": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/control-has-associated-label": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",

    "no-duplicate-imports": ["error", {"allowSeparateTypeImports": true}],
    "typescript/no-explicit-any": "error",
    "eqeqeq": "error",
    "typescript/no-unused-vars": "warn",
    "typescript/explicit-function-return-type": "off",
    "typescript/no-empty-interface": "off",
    "typescript/consistent-type-imports": "error",
    "react/self-closing-comp": "error",
    "react/exhaustive-deps": "error",
    "react/jsx-no-useless-fragment": "error",
    "nextjs/no-img-element": "off",
    "no-console": "off",
    "no-alert": "warn",
    "no-else-return": "error",
    "func-style": "off",
    "no-inline-comments": "off",
    "sort-keys": "off",
    "max-statements": "off",
    "no-use-before-define": "off",
    "unicorn/filename-case": "off",
    "import/first": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/no-array-for-each": "off",
    "react-perf/jsx-no-new-function-as-prop": "off",
    "react-perf/jsx-no-new-array-as-prop": "off",
    "react-perf/jsx-no-new-object-as-prop": "off",
    "react-perf/jsx-no-jsx-as-prop": "off",
    "promise/prefer-await-to-then": "off",
    "no-undefined": "off",
    "typescript/strict-boolean-expressions": "off",
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/no-unsafe-member-access": "off",
    "typescript/no-unsafe-call": "off",
    "typescript/no-unsafe-assignment": "off",
    "typescript/no-unsafe-return": "off",
    "typescript/no-non-null-assertion": "off",
    "typescript/no-misused-promises": "off",
    "typescript/prefer-nullish-coalescing": "off",
    "typescript/no-confusing-void-expression": "off",
    "typescript/no-deprecated": "off",
    "typescript/no-unnecessary-template-expression": "off",
    "typescript/no-unnecessary-type-assertion": "off",
    "require-await": "off",
    "no-shadow": "off",
    "no-nested-ternary": "off",
    "complexity": "off",
    "no-negated-condition": "off",
    "prefer-destructuring": "off",
    "no-fallthrough": "off",
    "no-plusplus": "off",
    "no-empty-function": "off",
    "no-promise-executor-return": "off",
    "no-bitwise": "off",
    "default-case": "off",
    "no-void": "off",
    "no-param-reassign": "off",
    "class-methods-use-this": "off",
    "no-useless-computed-key": "off",
    "no-empty": "off",
    "react/no-array-index-key": "off",
    "react/no-unescaped-entities": "off",
    "react/jsx-no-constructed-context-values": "off",
    "react/jsx-handler-names": "off",
    "react/no-set-state": "off",
    "react/no-danger": "off",
    "import/no-relative-parent-imports": "off",
    "unicorn/prefer-string-replace-all": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/prefer-number-properties": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/prefer-object-from-entries": "off",
    "unicorn/prefer-set-has": "off",
    "unicorn/no-immediate-mutation": "off",
    "unicorn/new-for-builtins": "off",
    "unicorn/prefer-structured-clone": "off",
    "unicorn/prefer-query-selector": "off",
    "unicorn/no-document-cookie": "off",
    "unicorn/prefer-dom-node-remove": "off",
    "unicorn/no-object-as-default-parameter": "off",
    "unicorn/no-instanceof-builtins": "off",
    "unicorn/prefer-native-coercion-functions": "off",
    "jsdoc/require-param-type": "off",
    "oxc/no-barrel-file": "off",
    "oxc/no-accumulating-spread": "off",
    "unicorn/no-nested-ternary": "off",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "typescript/promise-function-async": "off",
    "typescript/only-throw-error": "off",
    "typescript/no-unsafe-argument": "off",
    "typescript/no-dynamic-delete": "off",
    "typescript/no-inferrable-types": "off",
    "jest/require-hook": "off",
    "react/jsx-pascal-case": "off",
    "jsdoc/require-returns-type": "off",
    "import/no-named-as-default": "off",
  },
});
