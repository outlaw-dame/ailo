# Testing

`npm test` runs the whole suite with Node's built-in test runner
(`node:test` + `tsx` for TS/JSX) — no Jest, no Vitest. Three kinds of
files:

- `*.test.ts` — pure logic. No DOM, no React, no `@glaze/core/*`. Most of
  the suite is this: business logic extracted into small, dependency-free
  modules specifically so it *can* be tested this way (see e.g.
  `main/services/moderation-stats-logic.ts` vs. its thin `@glaze/core`-using
  wrapper `moderation-stats.ts`).
- `*.test.tsx` with `renderHook` — React hooks (`@testing-library/react`).
  No DOM primitives needed beyond what jsdom provides globally.
- `*.test.tsx` with `render`/`screen` — real components, rendered against
  the **real** `@glaze/core/components` implementation (not a mock — see
  below), using `@testing-library/react` + `@testing-library/user-event`.

## Why the test script looks the way it does

```
node --preserve-symlinks --import tsx --import global-jsdom/register --test --test-force-exit ...
```

- **`--import global-jsdom/register`** — installs a jsdom `window`/
  `document` as real globals before anything else runs, so `render()` has
  somewhere to mount.
- **`--preserve-symlinks`** — `@glaze/core/components` (and every other
  `@glaze/core/*` subpath) is a real npm package, but it lives outside this
  repo at `../glaze-core` (see `scripts/link-glaze-core.mjs`) and is
  reached through a symlink at `node_modules/@glaze/core`. Node's default
  resolver follows a symlink to its *real* on-disk path before resolving
  that package's own imports — which then makes it look for its peer deps
  (`@tanstack/react-query`, `react`, …) starting from *inside
  `../glaze-core`*, where they aren't installed, instead of from this
  repo's `node_modules`, where they are. `--preserve-symlinks` keeps
  resolution anchored at the symlink's logical location instead, so those
  peer deps resolve normally.
- **`--test-force-exit`** — some libraries (TanStack Query is the one
  we've hit) behave differently once `window` exists: `QueryClient`
  detects a browser-like environment and starts real focus/online
  listeners and per-query GC timers. A test that builds a `QueryClient`
  and never tears it down (`client.clear()`/`.unmount()`) leaves one of
  those running, and plain `node --test` — unlike Jest/Vitest — waits for
  Node's event loop to drain naturally rather than force-killing the
  worker, which turned a ~300ms suite into one that took **7 minutes** to
  actually exit (all tests passed the whole time — it was purely stuck
  waiting to terminate). `--test-force-exit` ends the process the moment
  every test has reported, regardless of what's still pending. Prefer
  tearing down anything you construct in your own new tests either way —
  this flag is a safety net for third-party library behavior, not a
  substitute.

## Why `@glaze/core/components` is the real thing, not a mock

It's a real package (`../glaze-core/package.json` names it `@glaze/core`
with a proper `exports` map), just never installed into this repo's
`node_modules` — the actual Electron/Vite build resolves it its own way,
and nothing else ever needed it resolvable under plain Node before now.
`scripts/link-glaze-core.mjs` (run as `postinstall`) symlinks it in.

**It's deliberately not a `package.json` dependency.** `../glaze-core`'s
own version string is `"0.13.0.0"` — four segments, not valid semver — and
a real `file:` dependency on it makes npm validate the *entire* tree
against that version, which fails a plain `npm install` outright (you can
`npm install "@glaze/core@file:../glaze-core"` as a one-off fine; a
subsequent bare `npm install` then errors with `Invalid Version:
0.13.0.0`). The symlink route means npm never has to reason about its
version at all — `postinstall` just makes sure the link exists and is
correct every time `npm install` runs, self-healing if npm ever prunes it
as "extraneous" (it does, since it's not a tracked dependency).

If `../glaze-core` isn't present alongside this repo (e.g. some CI
environment that only builds/lints without the full Glaze SDK checked
out), `postinstall` logs a note and exits cleanly rather than failing the
install — component tests just won't have anything to render against
there, but everything else still works.
