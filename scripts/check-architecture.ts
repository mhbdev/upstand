type Rule = {
  layer: string;
  root: string;
  forbidden: string[];
};

const rules: Rule[] = [
  {
    layer: "domain",
    root: "packages/domain/src",
    forbidden: [
      "@circulo-ai/di",
      "@upstand/platform",
      "@upstand/db",
      "@upstand/redis",
      "@upstand/repositories",
      "@upstand/auth",
      "@upstand/env",
      "node:child_process",
      "node:crypto",
      "node:fs",
      "micro-key-producer",
      "sshpk",
    ],
  },
  {
    layer: "application",
    root: "packages/usecases/src",
    forbidden: [
      "@upstand/db",
      "@upstand/repositories",
      "@upstand/auth",
      "@upstand/env",
      "react",
      "next",
      "hono",
      "@trpc",
    ],
  },
];

const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const violations: string[] = [];

for (const rule of rules) {
  const glob = new Bun.Glob(`${rule.root}/**/*.{ts,tsx}`);
  for await (const path of glob.scan({ cwd: process.cwd() })) {
    const source = await Bun.file(path).text();
    for (const match of source.matchAll(importPattern)) {
      const imported = match[1];
      const forbidden = rule.forbidden.find(
        (dependency) =>
          imported === dependency || imported.startsWith(`${dependency}/`),
      );
      if (forbidden) violations.push(`${path}: ${forbidden}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Architecture boundaries passed.");
