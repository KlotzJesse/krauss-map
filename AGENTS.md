## Dev

- You must use bun or bunx for all commands. Do not use npm or yarn, npx, or pnpm.
- Use `bunx` for one-off commands like `bunx shadcn@latest init` or `bunx shadcn@latest add button`.
- Use `bun` for project-level commands like `bun install` or `bun run dev`.
- Do not use `npx` or `npm` or `yarn` for any commands. They are not available and will not work.
- Do not use `pnpm` for any commands. It is not available and will not work.

## UI Library

- The agent is designed to integrate with the shadcn/ui component library.
- It can discover, install, and customize components from the shadcn registry.
- It handles dependencies, configuration, and quality assurance for seamless integration.
- You must use base-ui components for best compatibility. Custom components may require additional configuration.
- Never use radix-ui

## Token Efficiency

- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Lust do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.
