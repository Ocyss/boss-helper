# Repository Guidelines

## Project Structure & Module Organization

This repository is a WXT + Vue 3 browser extension. Application code lives in `src/`: browser entry points are under `src/entrypoints`, reusable UI is in `src/components`, stateful feature logic is grouped in `src/composables`, and shared types/utilities live in `src/types` and `src/utils`. Static extension files, icons, and locales belong in `public/`; documentation images belong in `docs/img`. `packages/devlog-ui` is a Git submodule/workspace dependency, so initialize submodules after cloning. Generated WXT output is written to `.output/` and must not be committed.

## Build, Test, and Development Commands

Use Bun, matching `bun.lock` and CI:

- `git submodule update --init --recursive` — fetch workspace submodules.
- `bun install` — install dependencies and run `wxt prepare`.
- `bun run dev` — start Chrome development mode; use `dev:edge` or `dev:firefox` for other browsers.
- `bun run check` — run Vue/TypeScript type checking without emitting files.
- `bun run lint` and `bun run fmt:check` — enforce lint and formatting rules.
- `bun run build` — build Chrome, Firefox, and Edge variants.
- `bun run zip` — create release archives under `.output/`, matching the release workflow.

## Coding Style & Naming Conventions

Follow `oxfmt.config.ts`: two-space indentation, single quotes, no semicolons, trailing commas, and sorted imports. Run `bun run fmt` for mechanical formatting and `bun run lint:fix` for safe lint fixes. Use PascalCase for Vue components (`JobCard.vue`), camelCase for functions/composables (`useStatistics.ts`), and descriptive feature folders. Prefer `@/` imports for code under `src`. Add concise comments only where browser behavior, workflow ordering, or edge cases are not obvious.

## Testing Guidelines

No automated test framework is currently configured. Every change must pass `bun run check`, `bun run lint`, and `bun run fmt:check`. For behavior changes, build the affected browser target and manually load the unpacked extension from `.output/<browser>-mv3`; verify the relevant BOSS page flow, options UI, background messaging, and persisted configuration. If adding tests, colocate them as `*.spec.ts` and document the new command in `package.json`.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit prefixes such as `feat:`, `fix:`, `chore:`, `style:`, and `build:`; Chinese or English summaries are accepted. Keep each commit focused and avoid committing generated artifacts. Pull requests should explain the user-visible change, list verification commands and tested browsers, link related issues, and include screenshots or recordings for UI changes. Call out permission, host-access, manifest, or configuration changes explicitly because they affect extension review and user trust.
