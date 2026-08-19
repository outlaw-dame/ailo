#!/usr/bin/env node
/* eslint-disable no-undef -- plain Node script (console/process), not
   covered by the shared config's browser/renderer globals. */
// postinstall: makes `@glaze/core/*` resolve as a normal Node package for
// `node --test` (and any other plain-Node tooling) by symlinking it into
// node_modules — the SAME sibling directory glaze.ts's own CLI wrapper and
// tsconfig.json's path mappings already assume exists (`../glaze-core`,
// alongside this repo). Vite/Electron resolve it their own way at build
// time regardless; this symlink only matters for tests run directly under
// Node.
//
// NOT a package.json dependency on purpose: `../glaze-core/package.json`
// carries a 4-segment SDK version ("0.13.0.0", matching this repo's own
// `glaze.sdkVersion`) that isn't valid semver, and a real `file:` dependency
// on it makes npm validate the whole tree against that version — breaking
// a plain `npm install` outright (confirmed: `npm install
// "@glaze/core@file:../glaze-core"` succeeds on its own, but a subsequent
// bare `npm install` fails with "Invalid Version: 0.13.0.0"). A symlink
// sidesteps that entirely — npm never has to reason about its version.

import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "..", "..", "glaze-core");
const linkDir = resolve(__dirname, "..", "node_modules", "@glaze");
const linkPath = resolve(linkDir, "core");
const relativeTarget = "../../../glaze-core"; // from node_modules/@glaze/core

if (!existsSync(target)) {
  // Not every checkout of this repo runs inside a full Glaze dev environment
  // (e.g. a CI job that only lints/builds without the SDK checked out
  // alongside it) — skip quietly rather than fail the whole install.
  console.log("[link-glaze-core] ../glaze-core not found, skipping (component tests won't run here)");
  process.exit(0);
}

mkdirSync(linkDir, { recursive: true });

let needsLink = true;
if (existsSync(linkPath)) {
  try {
    if (lstatSync(linkPath).isSymbolicLink() && readlinkSync(linkPath) === relativeTarget) {
      needsLink = false; // already correct
    } else {
      rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {
    rmSync(linkPath, { recursive: true, force: true });
  }
}

if (needsLink) {
  symlinkSync(relativeTarget, linkPath, "dir");
  console.log(`[link-glaze-core] linked node_modules/@glaze/core -> ${relativeTarget}`);
}
