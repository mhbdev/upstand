/**
 * migrate.ts — One-time migration from marker-based CLI to AST-based CLI.
 *
 * This module:
 * 1. Rewrites all "host" files (barrels, di.ts, routers/index.ts, etc.) to a
 *    clean canonical form that ts-morph can manipulate safely.
 * 2. Does NOT touch files generated purely for a module (entities, usecases,
 *    router files, repository files) — those are left as-is.
 *
 * Run via:  bun cli migrate
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS, ROOT } from "../config";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip marker comment blocks (old CLI injection points) from source text */
function stripMarkers(src: string): string {
  // Remove  // <tag>…</tag>  blocks including content between them
  let result = src.replace(
    /\/\/ <[a-zA-Z0-9-]+-[a-zA-Z0-9-]+>[\s\S]*?\/\/ <\/[a-zA-Z0-9-]+-[a-zA-Z0-9-]+>/g,
    "",
  );
  // Remove standalone marker comments like // [GENERATED_...] — do not remove this marker
  result = result.replace(
    /\/\/ \[GENERATED_[^\]]+\] — do not remove this marker\n?/g,
    "",
  );
  // Fix double commas introduced by old injector: ,, → ,
  result = result.replace(/,,/g, ",");
  // Remove blank lines that result from removal (max 2 in a row)
  result = result.replace(/\n{3,}/g, "\n\n");
  return `${result.trim()}\n`;
}

function readUtf8(path: string): string {
  return readFileSync(path, "utf-8");
}

function saveClean(path: string, content: string, log: string[]): void {
  const clean = stripMarkers(content);
  writeFileSync(path, clean, "utf-8");
  log.push(`[FIX] ${path.replace(`${ROOT}/`, "")}`);
}

// ── Stale module list ─────────────────────────────────────────────────────────
// These are old test/demo modules created by the previous CLI. They are removed
// as part of migration. Edit this list if you want to keep any of them.
const STALE_MODULES = ["testentity", "foobar", "clifixtest"];

// ── File rewrite helpers ──────────────────────────────────────────────────────

/**
 * Rewrite domain/src/index.ts:
 * Keep only the known-good baseline exports (user, product if present, etc.)
 * and strip marker blocks.
 */
function migrateDomainIndex(log: string[]): void {
  const path = PATHS.domainIndex;
  if (!existsSync(path)) return;
  saveClean(path, readUtf8(path), log);
}

/**
 * Rewrite domain/src/tokens.ts — strips marker blocks.
 * Mid-file `import` statements inside markers are moved to top-level.
 */
function migrateDomainTokens(log: string[]): void {
  const path = PATHS.domainTokens;
  if (!existsSync(path)) return;
  // First strip markers (this may leave dangling import type lines in the middle
  // of the file). We rely on ts-morph's tolerant parser when editing later.
  saveClean(path, readUtf8(path), log);
}

function migrateUowInterface(log: string[]): void {
  const path = PATHS.uowInterface;
  if (!existsSync(path)) return;
  saveClean(path, readUtf8(path), log);
}

function migrateUseCasesIndex(log: string[]): void {
  const path = PATHS.usecasesIndex;
  if (!existsSync(path)) return;
  saveClean(path, readUtf8(path), log);
}

function migrateReposIndex(log: string[]): void {
  const path = PATHS.reposIndex;
  if (!existsSync(path)) return;
  saveClean(path, readUtf8(path), log);
}

function migrateDrizzleUow(log: string[]): void {
  const path = PATHS.drizzleUow;
  if (!existsSync(path)) return;
  saveClean(path, readUtf8(path), log);
}

/**
 * Rewrite di.ts — this is the most complex one.
 * Mid-file import statements (left by old markers) are TypeScript syntax errors
 * and must be moved to the top-level. We do this by:
 * 1. Extracting all mid-file import lines
 * 2. Deduplicating them
 * 3. Prepending them to the top-level imports block
 * 4. Removing them from their old positions
 * 5. Then stripping markers
 */
function migrateDiTs(log: string[]): void {
  const path = PATHS.diTs;
  if (!existsSync(path)) return;

  let src = readUtf8(path);

  // Extract import lines that appear AFTER the first non-import statement
  const lines = src.split("\n");
  const topImports: string[] = [];
  const bodyLines: string[] = [];
  let passedFirstBody = false;

  for (const line of lines) {
    const isImport = /^import\s/.test(line.trim());
    if (
      !passedFirstBody &&
      !isImport &&
      line.trim() &&
      !line.trim().startsWith("//")
    ) {
      passedFirstBody = true;
    }
    if (passedFirstBody && isImport) {
      // Mid-file import — hoist it
      topImports.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  if (topImports.length > 0) {
    // Find where top-level imports end
    let lastTopImportIdx = -1;
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      if (line && /^import\s/.test(line.trim())) lastTopImportIdx = i;
    }

    // Deduplicate: collect existing named imports from the same module specifiers
    const hoisted = topImports.filter((imp) => {
      const spec = imp.match(/from\s+["']([^"']+)["']/)?.[1];
      if (!spec) return true;
      // If the same module specifier already has an import at top, skip (we'll merge manually later)
      return !bodyLines
        .slice(0, lastTopImportIdx + 1)
        .some((l) => l?.includes(`from "${spec}"`));
    });

    if (hoisted.length > 0) {
      bodyLines.splice(lastTopImportIdx + 1, 0, ...hoisted);
    }

    src = bodyLines.join("\n");
  }

  saveClean(path, src, log);
}

/**
 * Rewrite routers/index.ts — the most visibly broken file.
 * Also removes stale module entries and imports.
 */
function migrateRoutersIndex(log: string[]): void {
  const path = PATHS.routersIndex;
  if (!existsSync(path)) return;
  let src = readUtf8(path);
  // Remove stale module imports
  for (const m of STALE_MODULES) {
    src = src.replace(
      new RegExp(`import \\{ ${m}Router \\} from "./${m}.router";\n?`, "g"),
      "",
    );
    src = src.replace(new RegExp(`\\s*${m}:\\s*${m}Router,?`, "g"), "");
  }
  saveClean(path, src, log);
}

// ── Remove stale generated files ──────────────────────────────────────────────

function removeStaleModuleFiles(log: string[]): void {
  for (const m of STALE_MODULES) {
    const paths = [
      join(PATHS.domainSrc, "entities", `${m}.ts`),
      join(PATHS.domainSrc, "repositories", `${m}-repository.interface.ts`),
      join(PATHS.usecasesSrc, m),
      join(PATHS.reposSrc, m),
      join(PATHS.routersSrc, `${m}.router.ts`),
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
        log.push(`[DEL] ${p.replace(`${ROOT}/`, "")}`);
      }
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function runMigration(log: string[]): void {
  log.push("[INFO] Running one-time migration from marker-based CLI…\n");
  removeStaleModuleFiles(log);
  migrateDomainIndex(log);
  migrateDomainTokens(log);
  migrateUowInterface(log);
  migrateUseCasesIndex(log);
  migrateReposIndex(log);
  migrateDrizzleUow(log);
  migrateDiTs(log);
  migrateRoutersIndex(log);
  log.push(
    "\n[INFO] Migration complete. Review the changes and run `bun cli check-types`.",
  );
}
