import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const START = dirname(fileURLToPath(import.meta.url));

function findMonorepoRoot(start = START) {
  let cur = start;
  for (let i = 0; i < 40; i++) {
    const pkg = join(cur, "package.json");
    if (existsSync(pkg)) {
      try {
        const data = JSON.parse(readFileSync(pkg, "utf-8"));
        if (data.workspaces || data.name === "upstand") return cur;
      } catch (_) {}
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // fallback to nearest package.json or start
  cur = start;
  for (let i = 0; i < 40; i++) {
    const pkg = join(cur, "package.json");
    if (existsSync(pkg)) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

export const ROOT = findMonorepoRoot();

export const PATHS = {
  domainSrc: join(ROOT, "packages/domain/src"),
  domainIndex: join(ROOT, "packages/domain/src/index.ts"),
  domainTokens: join(ROOT, "packages/domain/src/tokens.ts"),
  uowInterface: join(
    ROOT,
    "packages/domain/src/repositories/unit-of-work.interface.ts",
  ),
  usecasesSrc: join(ROOT, "packages/usecases/src"),
  usecasesIndex: join(ROOT, "packages/usecases/src/index.ts"),
  reposSrc: join(ROOT, "packages/repositories/src"),
  reposIndex: join(ROOT, "packages/repositories/src/index.ts"),
  drizzleUow: join(ROOT, "packages/repositories/src/drizzle-unit-of-work.ts"),
  diTs: join(ROOT, "packages/api/src/di.ts"),
  routersSrc: join(ROOT, "packages/api/src/routers"),
  routersIndex: join(ROOT, "packages/api/src/routers/index.ts"),
  dbSchemaSrc: join(ROOT, "packages/db/src/schema"),
  dbSchemaIndex: join(ROOT, "packages/db/src/schema/index.ts"),
};

export function resolveWorkspace() {
  return { root: ROOT };
}
