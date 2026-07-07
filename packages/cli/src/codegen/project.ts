import { IndentationText, Project, QuoteKind } from "ts-morph";
import { ROOT } from "../config";

let singleton: Project | null = null;

/**
 * Initialise the ts-morph Project singleton.
 * We skip loading all files from tsconfig — files are added on-demand by
 * each generate/unpatch function. This keeps startup fast in a large monorepo.
 */
export function createProjectSingleton(_root?: string) {
  if (singleton) return singleton;
  singleton = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Double,
      useTrailingCommas: true,
    },
  });
  return singleton;
}

export function getProject() {
  if (!singleton) createProjectSingleton(ROOT);
  if (!singleton) throw new Error("Failed to initialize ts-morph project");
  return singleton;
}

export function resetProject() {
  singleton = null;
}
