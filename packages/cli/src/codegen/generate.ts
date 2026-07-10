import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  Scope,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import { PATHS } from "../config";
import type { FieldDef, ModuleConfig, ProcedureConfig } from "../types";
import {
  buildDrizzleSchemaBody,
  buildDtoBody,
  buildInputSchemaBody,
  buildSchemaBody,
  capitalize,
  getDrizzleImports,
} from "./helpers";
import { getProject } from "./project";

function ensureDir(filePath: string): void {
  mkdirSync(join(filePath, ".."), { recursive: true });
}

function addNamedImport(
  file: SourceFile,
  moduleSpecifier: string,
  importName: string,
  isTypeOnly = false,
): void {
  const existing = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (existing) {
    const already = existing
      .getNamedImports()
      .some((n) => n.getName() === importName);
    if (!already) existing.addNamedImport(importName);
    return;
  }
  file.addImportDeclaration({
    moduleSpecifier,
    namedImports: [importName],
    isTypeOnly,
  });
}

function removeNamedImport(
  file: SourceFile,
  moduleSpecifier: string,
  importName: string,
): void {
  for (const decl of [...file.getImportDeclarations()]) {
    if (decl.getModuleSpecifierValue() !== moduleSpecifier) continue;
    const named = decl
      .getNamedImports()
      .find((n) => n.getName() === importName);
    if (!named) continue;
    named.remove();
    if (
      decl.getNamedImports().length === 0 &&
      !decl.getDefaultImport() &&
      !decl.getNamespaceImport()
    )
      decl.remove();
    break;
  }
}

function removeNamedImportAnywhere(file: SourceFile, importName: string): void {
  for (const decl of [...file.getImportDeclarations()]) {
    const named = decl
      .getNamedImports()
      .find((n) => n.getName() === importName);
    if (!named) continue;
    named.remove();
    if (
      decl.getNamedImports().length === 0 &&
      !decl.getDefaultImport() &&
      !decl.getNamespaceImport()
    )
      decl.remove();
  }
}

function serviceProviderIndex(file: SourceFile): number {
  const decl = file.getVariableDeclaration("serviceProvider");
  if (!decl) return file.getStatements().length;
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (!stmt) return file.getStatements().length;
  return file.getStatements().indexOf(stmt);
}

export function generateEntityFile(config: ModuleConfig, log: string[]): void {
  const lc = config.name.toLowerCase();
  const cap = capitalize(config.name);
  const project = getProject();
  const filePath = join(PATHS.domainSrc, "entities", `${lc}.ts`);
  ensureDir(filePath);
  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);
  const file = project.createSourceFile(
    filePath,
    `import { z } from "zod";\n\nexport const ${cap}Schema = z.object({\n${buildSchemaBody(config.fields)},\n});\n\nexport type ${cap} = z.infer<typeof ${cap}Schema>;\n\nexport interface Create${cap}DTO {\n${buildDtoBody(config.fields)}\n}\n`,
    { overwrite: true },
  );
  file.saveSync();
  log.push(`[NEW] packages/domain/src/entities/${lc}.ts`);
}

export function removeEntityFile(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const filePath = join(PATHS.domainSrc, "entities", `${lc}.ts`);
  if (!existsSync(filePath)) return;
  const sf = getProject().getSourceFile(filePath);
  if (sf) getProject().removeSourceFile(sf);
  rmSync(filePath);
  log.push(`[DEL] packages/domain/src/entities/${lc}.ts`);
}

export function generateRepositoryInterfaceFile(
  name: string,
  log: string[],
): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  const filePath = join(
    PATHS.domainSrc,
    "repositories",
    `${lc}-repository.interface.ts`,
  );
  ensureDir(filePath);
  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);
  const file = project.createSourceFile(
    filePath,
    `import type { ${cap}, Create${cap}DTO } from "../entities/${lc}";\n\nexport interface I${cap}Repository {\n  findById(id: string): Promise<${cap} | null>;\n  create(data: Create${cap}DTO): Promise<${cap}>;\n}\n`,
    { overwrite: true },
  );
  file.saveSync();
  log.push(
    `[NEW] packages/domain/src/repositories/${lc}-repository.interface.ts`,
  );
}

export function removeRepositoryInterfaceFile(
  name: string,
  log: string[],
): void {
  const lc = name.toLowerCase();
  const filePath = join(
    PATHS.domainSrc,
    "repositories",
    `${lc}-repository.interface.ts`,
  );
  if (!existsSync(filePath)) return;
  const sf = getProject().getSourceFile(filePath);
  if (sf) getProject().removeSourceFile(sf);
  rmSync(filePath);
  log.push(
    `[DEL] packages/domain/src/repositories/${lc}-repository.interface.ts`,
  );
}

export function patchDomainIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.domainIndex)) {
    ensureDir(PATHS.domainIndex);
    project
      .createSourceFile(
        PATHS.domainIndex,
        `// Core domain exports\nexport * from "./entities/user";\nexport * from "./repositories/user-repository.interface";\nexport * from "./tokens";\n`,
      )
      .saveSync();
    log.push("[FIX] packages/domain/src/index.ts (recreated clean baseline)");
  }
  const file =
    project.getSourceFile(PATHS.domainIndex) ??
    project.addSourceFileAtPath(PATHS.domainIndex);
  for (const spec of [
    `./entities/${lc}`,
    `./repositories/${lc}-repository.interface`,
  ]) {
    const already = file
      .getExportDeclarations()
      .some((e) => e.getModuleSpecifierValue() === spec);
    if (!already) file.addExportDeclaration({ moduleSpecifier: spec });
  }
  file.saveSync();
  log.push("[MOD] packages/domain/src/index.ts");
}

export function unpatchDomainIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.domainIndex)) return;
  const file =
    project.getSourceFile(PATHS.domainIndex) ??
    project.addSourceFileAtPath(PATHS.domainIndex);
  for (const spec of [
    `./entities/${lc}`,
    `./repositories/${lc}-repository.interface`,
  ]) {
    file
      .getExportDeclarations()
      .find((e) => e.getModuleSpecifierValue() === spec)
      ?.remove();
  }
  file.saveSync();
  log.push("[MOD] packages/domain/src/index.ts");
}

export function patchDomainTokens(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.domainTokens)) {
    ensureDir(PATHS.domainTokens);
    project
      .createSourceFile(
        PATHS.domainTokens,
        `import { createToken } from "@circulo-ai/di";\nimport type { IUnitOfWork } from "./repositories/unit-of-work.interface";\nimport type { IUserRepository } from "./repositories/user-repository.interface";\n\nexport const UserRepositoryToken = createToken<IUserRepository>("IUserRepository");\nexport const UnitOfWorkToken = createToken<IUnitOfWork>("IUnitOfWork");\n`,
      )
      .saveSync();
    log.push("[FIX] packages/domain/src/tokens.ts (recreated clean baseline)");
  }
  const file =
    project.getSourceFile(PATHS.domainTokens) ??
    project.addSourceFileAtPath(PATHS.domainTokens);
  addNamedImport(
    file,
    `./repositories/${lc}-repository.interface`,
    `I${cap}Repository`,
    true,
  );
  if (!file.getVariableDeclaration(`${cap}RepositoryToken`)) {
    file.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `${cap}RepositoryToken`,
          initializer: `createToken<I${cap}Repository>("I${cap}Repository")`,
        },
      ],
    });
  }
  file.saveSync();
  log.push("[MOD] packages/domain/src/tokens.ts");
}

export function unpatchDomainTokens(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.domainTokens)) return;
  const file =
    project.getSourceFile(PATHS.domainTokens) ??
    project.addSourceFileAtPath(PATHS.domainTokens);
  file
    .getVariableDeclaration(`${cap}RepositoryToken`)
    ?.getFirstAncestorByKind(SyntaxKind.VariableStatement)
    ?.remove();
  removeNamedImport(
    file,
    `./repositories/${lc}-repository.interface`,
    `I${cap}Repository`,
  );
  file.saveSync();
  log.push("[MOD] packages/domain/src/tokens.ts");
}

export function patchUnitOfWorkInterface(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.uowInterface)) {
    ensureDir(PATHS.uowInterface);
    project
      .createSourceFile(
        PATHS.uowInterface,
        `import type { IUserRepository } from "./user-repository.interface";\n\nexport interface IUnitOfWork {\n  userRepository: IUserRepository;\n  transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;\n}\n`,
      )
      .saveSync();
    log.push(
      "[FIX] packages/domain/src/repositories/unit-of-work.interface.ts (recreated clean baseline)",
    );
  }
  const file =
    project.getSourceFile(PATHS.uowInterface) ??
    project.addSourceFileAtPath(PATHS.uowInterface);
  addNamedImport(
    file,
    `./${lc}-repository.interface`,
    `I${cap}Repository`,
    true,
  );
  const iface = file.getInterface("IUnitOfWork");
  if (iface && !iface.getProperty(`${lc}Repository`)) {
    const txMethod = iface.getMethod("transaction");
    const insertIndex = txMethod
      ? iface.getMembers().indexOf(txMethod)
      : iface.getMembers().length;
    iface.insertProperty(insertIndex, {
      name: `${lc}Repository`,
      type: `I${cap}Repository`,
    });
  }
  file.saveSync();
  log.push("[MOD] packages/domain/src/repositories/unit-of-work.interface.ts");
}

export function unpatchUnitOfWorkInterface(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.uowInterface)) return;
  const file =
    project.getSourceFile(PATHS.uowInterface) ??
    project.addSourceFileAtPath(PATHS.uowInterface);
  file.getInterface("IUnitOfWork")?.getProperty(`${lc}Repository`)?.remove();
  removeNamedImport(file, `./${lc}-repository.interface`, `I${cap}Repository`);
  file.saveSync();
  log.push("[MOD] packages/domain/src/repositories/unit-of-work.interface.ts");
}

export function generateUseCaseFile(config: ModuleConfig, log: string[]): void {
  const lc = config.name.toLowerCase();
  const cap = capitalize(config.name);
  const project = getProject();
  const filePath = join(PATHS.usecasesSrc, lc, `create-${lc}.usecase.ts`);
  ensureDir(filePath);
  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);
  const file = project.createSourceFile(
    filePath,
    `import type { IUnitOfWork, ${cap} } from "@upstand/domain";\nimport { z } from "zod";\n\nexport const Create${cap}InputSchema = z.object({\n${buildInputSchemaBody(config.fields)},\n});\n\nexport type Create${cap}Input = z.infer<typeof Create${cap}InputSchema>;\n\nexport class Create${cap}UseCase {\n  constructor(private readonly uow: IUnitOfWork) {}\n\n  async execute(_input: Create${cap}Input): Promise<${cap}> {\n    return this.uow.transaction(async (_tx) => {\n      // Scaffolded implementation using _tx.${lc}Repository\n      throw new Error("Implementation required");\n    });\n  }\n}\n`,
    { overwrite: true },
  );
  file.saveSync();
  log.push(`[NEW] packages/usecases/src/${lc}/create-${lc}.usecase.ts`);
}

export function removeUseCaseDirectory(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const dir = join(PATHS.usecasesSrc, lc);
  if (!existsSync(dir)) return;
  for (const sf of getProject().getSourceFiles()) {
    if (sf.getFilePath().startsWith(dir)) getProject().removeSourceFile(sf);
  }
  rmSync(dir, { recursive: true, force: true });
  log.push(`[DEL] packages/usecases/src/${lc}/`);
}

export function patchUseCasesIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.usecasesIndex)) {
    ensureDir(PATHS.usecasesIndex);
    project
      .createSourceFile(
        PATHS.usecasesIndex,
        `export * from "./user/create-user.usecase";\n`,
      )
      .saveSync();
    log.push("[FIX] packages/usecases/src/index.ts (recreated clean baseline)");
  }
  const file =
    project.getSourceFile(PATHS.usecasesIndex) ??
    project.addSourceFileAtPath(PATHS.usecasesIndex);
  const spec = `./${lc}/create-${lc}.usecase`;
  const already = file
    .getExportDeclarations()
    .some((e) => e.getModuleSpecifierValue() === spec);
  if (!already) file.addExportDeclaration({ moduleSpecifier: spec });
  file.saveSync();
  log.push("[MOD] packages/usecases/src/index.ts");
}

export function unpatchUseCasesIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.usecasesIndex)) return;
  const file =
    project.getSourceFile(PATHS.usecasesIndex) ??
    project.addSourceFileAtPath(PATHS.usecasesIndex);
  const spec = `./${lc}/create-${lc}.usecase`;
  file
    .getExportDeclarations()
    .find((e) => e.getModuleSpecifierValue() === spec)
    ?.remove();
  file.saveSync();
  log.push("[MOD] packages/usecases/src/index.ts");
}

export function generateDrizzleRepositoryFile(
  name: string,
  log: string[],
): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  const filePath = join(PATHS.reposSrc, lc, `drizzle-${lc}.repository.ts`);
  ensureDir(filePath);
  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);
  const file = project.createSourceFile(
    filePath,
    `import type { I${cap}Repository, ${cap}, Create${cap}DTO } from "@upstand/domain";\nimport { BaseRepository } from "../shared/base.repository";\nimport type { Executor } from "../shared/types";\nimport { ${lc} } from "@upstand/db";\n\nexport class Drizzle${cap}Repository\n  extends BaseRepository<typeof ${lc}, ${cap}, Create${cap}DTO>\n  implements I${cap}Repository\n{\n  constructor(executor: Executor) {\n    super(executor, ${lc});\n  }\n}\n`,
    { overwrite: true },
  );
  file.saveSync();
  log.push(`[NEW] packages/repositories/src/${lc}/drizzle-${lc}.repository.ts`);
}

export function removeRepositoryDirectory(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const dir = join(PATHS.reposSrc, lc);
  if (!existsSync(dir)) return;
  for (const sf of getProject().getSourceFiles()) {
    if (sf.getFilePath().startsWith(dir)) getProject().removeSourceFile(sf);
  }
  rmSync(dir, { recursive: true, force: true });
  log.push(`[DEL] packages/repositories/src/${lc}/`);
}

export function patchRepositoriesIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.reposIndex)) {
    ensureDir(PATHS.reposIndex);
    project
      .createSourceFile(
        PATHS.reposIndex,
        `export * from "./drizzle-unit-of-work";\nexport * from "./shared";\nexport * from "./user/drizzle-user.repository";\n`,
      )
      .saveSync();
    log.push(
      "[FIX] packages/repositories/src/index.ts (recreated clean baseline)",
    );
  }
  const file =
    project.getSourceFile(PATHS.reposIndex) ??
    project.addSourceFileAtPath(PATHS.reposIndex);
  const spec = `./${lc}/drizzle-${lc}.repository`;
  const already = file
    .getExportDeclarations()
    .some((e) => e.getModuleSpecifierValue() === spec);
  if (!already) file.addExportDeclaration({ moduleSpecifier: spec });
  file.saveSync();
  log.push("[MOD] packages/repositories/src/index.ts");
}

export function unpatchRepositoriesIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.reposIndex)) return;
  const file =
    project.getSourceFile(PATHS.reposIndex) ??
    project.addSourceFileAtPath(PATHS.reposIndex);
  const spec = `./${lc}/drizzle-${lc}.repository`;
  file
    .getExportDeclarations()
    .find((e) => e.getModuleSpecifierValue() === spec)
    ?.remove();
  file.saveSync();
  log.push("[MOD] packages/repositories/src/index.ts");
}

export function patchDrizzleUnitOfWork(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.drizzleUow)) {
    ensureDir(PATHS.drizzleUow);
    project
      .createSourceFile(
        PATHS.drizzleUow,
        `import type { IUnitOfWork } from "@upstand/domain";\nimport type { Executor } from "./shared/types";\nimport { DrizzleUserRepository } from "./user/drizzle-user.repository";\n\nexport class DrizzleUnitOfWork implements IUnitOfWork {\n  public readonly userRepository: DrizzleUserRepository;\n\n  constructor(private readonly executor: Executor) {\n    this.userRepository = new DrizzleUserRepository(this.executor);\n  }\n\n  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {\n    return this.executor.transaction(async (tx) => {\n      const txUow = new DrizzleUnitOfWork(tx);\n      return work(txUow);\n    });\n  }\n}\n`,
      )
      .saveSync();
    log.push(
      "[FIX] packages/repositories/src/drizzle-unit-of-work.ts (recreated clean baseline)",
    );
  }
  const file =
    project.getSourceFile(PATHS.drizzleUow) ??
    project.addSourceFileAtPath(PATHS.drizzleUow);
  addNamedImport(
    file,
    `./${lc}/drizzle-${lc}.repository`,
    `Drizzle${cap}Repository`,
  );
  const cls = file.getClass("DrizzleUnitOfWork");
  if (!cls) {
    file.saveSync();
    log.push("[MOD] packages/repositories/src/drizzle-unit-of-work.ts");
    return;
  }
  if (!cls.getProperty(`${lc}Repository`)) {
    const ctor = cls.getConstructors()[0];
    const insertIdx = ctor
      ? cls.getMembers().indexOf(ctor)
      : cls.getMembers().length;
    cls.insertProperty(insertIdx, {
      scope: Scope.Public,
      isReadonly: true,
      name: `${lc}Repository`,
      type: `Drizzle${cap}Repository`,
    });
  }
  const ctor = cls.getConstructors()[0];
  if (ctor) {
    const alreadyInit = ctor
      .getStatements()
      .some((s) => s.getText().includes(`this.${lc}Repository`));
    if (!alreadyInit)
      ctor.addStatements(
        `this.${lc}Repository = new Drizzle${cap}Repository(this.executor);`,
      );
  }
  file.saveSync();
  log.push("[MOD] packages/repositories/src/drizzle-unit-of-work.ts");
}

export function unpatchDrizzleUnitOfWork(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.drizzleUow)) return;
  const file =
    project.getSourceFile(PATHS.drizzleUow) ??
    project.addSourceFileAtPath(PATHS.drizzleUow);
  const cls = file.getClass("DrizzleUnitOfWork");
  if (cls) {
    cls.getProperty(`${lc}Repository`)?.remove();
    const ctor = cls.getConstructors()[0];
    if (ctor) {
      for (const stmt of [...ctor.getStatements()]) {
        if (stmt.getText().includes(`this.${lc}Repository`)) stmt.remove();
      }
    }
  }
  removeNamedImportAnywhere(file, `Drizzle${cap}Repository`);
  file.saveSync();
  log.push("[MOD] packages/repositories/src/drizzle-unit-of-work.ts");
}

export function generateRouterFile(
  name: string,
  procedureAccess: "public" | "protected",
  log: string[],
): void {
  const lc = name.toLowerCase();
  const cap = capitalize(name);
  const project = getProject();
  const filePath = join(PATHS.routersSrc, `${lc}.router.ts`);
  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);
  const procedure =
    procedureAccess === "public" ? "publicProcedure" : "protectedProcedure";
  const file = project.createSourceFile(
    filePath,
    `import { Create${cap}InputSchema } from "@upstand/usecases";\nimport { Create${cap}UseCaseToken } from "../di";\nimport { ${procedure}, router } from "../index";\nimport { handleUseCaseError } from "../errors";\n\nexport const ${lc}Router = router({\n  create: ${procedure}\n    .input(Create${cap}InputSchema)\n    .mutation(async ({ ctx, input }) => {\n      const useCase = ctx.scope.resolve(Create${cap}UseCaseToken);\n      try {\n        return await useCase.execute(input);\n      } catch (error) {\n        handleUseCaseError(error);\n      }\n    }),\n});\n`,
    { overwrite: true },
  );
  file.saveSync();
  log.push(`[NEW] packages/api/src/routers/${lc}.router.ts`);
}

export function removeRouterFile(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const filePath = join(PATHS.routersSrc, `${lc}.router.ts`);
  if (!existsSync(filePath)) return;
  const sf = getProject().getSourceFile(filePath);
  if (sf) getProject().removeSourceFile(sf);
  rmSync(filePath);
  log.push(`[DEL] packages/api/src/routers/${lc}.router.ts`);
}

export function addProcedureToRouter(
  config: ProcedureConfig,
  log: string[],
): void {
  const lc = config.moduleName.toLowerCase();
  const project = getProject();
  const filePath = join(PATHS.routersSrc, `${lc}.router.ts`);
  if (!existsSync(filePath)) {
    log.push(`[ERR] Router file not found: ${filePath}`);
    return;
  }
  const file =
    project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  const procedure =
    config.procedureAccess === "public"
      ? "publicProcedure"
      : "protectedProcedure";
  addNamedImport(file, "../index", procedure);
  if (config.useCaseToken) addNamedImport(file, "../di", config.useCaseToken);
  if (config.inputSchema)
    addNamedImport(file, "@upstand/usecases", config.inputSchema);
  const routerVar = file.getVariableDeclaration(`${lc}Router`);
  if (!routerVar) {
    log.push(`[ERR] Could not find ${lc}Router variable`);
    return;
  }
  const callExpr = routerVar.getInitializerIfKind(SyntaxKind.CallExpression);
  if (!callExpr) {
    log.push(`[ERR] ${lc}Router initializer is not a call expression`);
    return;
  }
  const arg = callExpr.getArguments()[0];
  if (!arg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    log.push("[ERR] Expected object literal as router() argument");
    return;
  }
  const routerObj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  if (routerObj.getProperty(config.procedureName)) {
    log.push(
      `[SKIP] Procedure '${config.procedureName}' already exists in ${lc}Router`,
    );
    return;
  }
  const inputLine = config.inputSchema
    ? `    .input(${config.inputSchema})\n`
    : "";
  let body: string;
  if (config.useCaseToken) {
    body = `    .${config.procedureKind}(async ({ ctx, input }) => {\n      const useCase = ctx.scope.resolve(${config.useCaseToken});\n      try {\n        return await useCase.execute(input);\n      } catch (error) {\n        handleUseCaseError(error);\n      }\n    })`;
  } else if (config.procedureKind === "query") {
    body = `    .${config.procedureKind}(async ({ ctx }) => {\n      // Implement query logic here\n      return [];\n    })`;
  } else {
    body = `    .${config.procedureKind}(async ({ ctx, input }) => {\n      // Implement mutation logic here\n      throw new Error("Implementation required");\n    })`;
  }
  const initializer = `${procedure}\n${inputLine}${body}`;
  routerObj.addPropertyAssignment({ name: config.procedureName, initializer });
  file.saveSync();
  log.push(
    `[MOD] packages/api/src/routers/${lc}.router.ts — added '${config.procedureName}'`,
  );
}

export function patchDiTs(name: string, log: string[]): void {
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.diTs)) {
    ensureDir(PATHS.diTs);
    project
      .createSourceFile(
        PATHS.diTs,
        `import { createToken, ServiceCollection } from "@circulo-ai/di";\nimport { type DatabaseExecutor, db } from "@upstand/db";\nimport {\n  UnitOfWorkToken,\n  UserRepositoryToken,\n  ProductRepositoryToken,\n} from "@upstand/domain";\nimport {\n  DrizzleUnitOfWork,\n  DrizzleUserRepository,\n  DrizzleProductRepository,\n} from "@upstand/repositories";\nimport {\n  CreateUserUseCase,\n  CreateProductUseCase,\n} from "@upstand/usecases";\n\nexport const DbToken = createToken<DatabaseExecutor>("DatabaseExecutor");\nexport const CreateUserUseCaseToken = createToken<CreateUserUseCase>("CreateUserUseCase");\nexport const CreateProductUseCaseToken = createToken<CreateProductUseCase>("CreateProductUseCase");\n\nexport const services = new ServiceCollection();\n\nservices.addSingleton(DbToken, () => db);\n\nservices.addScoped(UserRepositoryToken, (c) => {\n  const executor = c.resolve(DbToken);\n  return new DrizzleUserRepository(executor);\n});\n\nservices.addScoped(ProductRepositoryToken, (c) => {\n  const executor = c.resolve(DbToken);\n  return new DrizzleProductRepository(executor);\n});\n\nservices.addScoped(UnitOfWorkToken, (c) => {\n  const executor = c.resolve(DbToken);\n  return new DrizzleUnitOfWork(executor);\n});\n\nservices.addTransient(CreateUserUseCaseToken, (c) => {\n  const uow = c.resolve(UnitOfWorkToken);\n  return new CreateUserUseCase(uow);\n});\n\nservices.addTransient(CreateProductUseCaseToken, (c) => {\n  const uow = c.resolve(UnitOfWorkToken);\n  return new CreateProductUseCase(uow);\n});\n\nexport const serviceProvider = services.build();\nexport type ServiceProvider = typeof serviceProvider;\n`,
      )
      .saveSync();
    log.push("[FIX] packages/api/src/di.ts (recreated clean baseline)");
  }
  const file =
    project.getSourceFile(PATHS.diTs) ??
    project.addSourceFileAtPath(PATHS.diTs);
  addNamedImport(file, "@upstand/domain", `${cap}RepositoryToken`);
  addNamedImport(file, "@upstand/repositories", `Drizzle${cap}Repository`);
  addNamedImport(file, "@upstand/usecases", `Create${cap}UseCase`);
  if (!file.getVariableDeclaration(`Create${cap}UseCaseToken`)) {
    const spIdx = serviceProviderIndex(file);
    file.insertStatements(spIdx, [
      `export const Create${cap}UseCaseToken = createToken<Create${cap}UseCase>("Create${cap}UseCase");`,
    ]);
  }
  const alreadyRegistered = file
    .getStatements()
    .some(
      (s) =>
        s.getText().includes(`${cap}RepositoryToken`) &&
        s.getText().includes("addScoped"),
    );
  if (!alreadyRegistered) {
    const spIdx = serviceProviderIndex(file);
    file.insertStatements(spIdx, [
      `services.addScoped(${cap}RepositoryToken, (c) => new Drizzle${cap}Repository(c.resolve(DbToken)));`,
      `services.addTransient(Create${cap}UseCaseToken, (c) => new Create${cap}UseCase(c.resolve(UnitOfWorkToken)));`,
    ]);
  }
  file.saveSync();
  log.push("[MOD] packages/api/src/di.ts");
}

export function unpatchDiTs(name: string, log: string[]): void {
  const cap = capitalize(name);
  const project = getProject();
  if (!existsSync(PATHS.diTs)) return;
  const file =
    project.getSourceFile(PATHS.diTs) ??
    project.addSourceFileAtPath(PATHS.diTs);
  file
    .getVariableDeclaration(`Create${cap}UseCaseToken`)
    ?.getFirstAncestorByKind(SyntaxKind.VariableStatement)
    ?.remove();
  for (const stmt of [...file.getStatements()]) {
    const text = stmt.getText();
    if (
      (text.includes(`${cap}RepositoryToken`) && text.includes("addScoped")) ||
      (text.includes(`Create${cap}UseCaseToken`) &&
        text.includes("addTransient"))
    )
      stmt.remove();
  }
  removeNamedImportAnywhere(file, `${cap}RepositoryToken`);
  removeNamedImportAnywhere(file, `Drizzle${cap}Repository`);
  removeNamedImportAnywhere(file, `Create${cap}UseCase`);
  file.saveSync();
  log.push("[MOD] packages/api/src/di.ts");
}

export function patchRoutersIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.routersIndex)) {
    ensureDir(PATHS.routersIndex);
    project
      .createSourceFile(
        PATHS.routersIndex,
        `import { CreateUserInputSchema } from "@upstand/usecases";\nimport { CreateUserUseCaseToken } from "../di";\nimport { handleUseCaseError } from "../errors";\nimport { protectedProcedure, publicProcedure, router } from "../index";\nimport { userRouter } from "./user.router";\n\nexport const appRouter = router({\n  healthCheck: publicProcedure.query(() => {\n    return "OK";\n  }),\n  privateData: protectedProcedure.query(({ ctx }) => {\n    return {\n      message: "This is private",\n      user: ctx.session.user,\n    };\n  }),\n  createUser: publicProcedure\n    .input(CreateUserInputSchema)\n    .mutation(async ({ ctx, input }) => {\n      const useCase = ctx.scope.resolve(CreateUserUseCaseToken);\n      try {\n        return await useCase.execute(input);\n      } catch (error) {\n        handleUseCaseError(error);\n      }\n    }),\n  user: userRouter,\n});\n\nexport type AppRouter = typeof appRouter;\n`,
      )
      .saveSync();
    log.push(
      "[FIX] packages/api/src/routers/index.ts (recreated clean baseline)",
    );
  }
  const file =
    project.getSourceFile(PATHS.routersIndex) ??
    project.addSourceFileAtPath(PATHS.routersIndex);
  addNamedImport(file, `./${lc}.router`, `${lc}Router`);
  const routerDecl = file.getVariableDeclaration("appRouter");
  const callExpr = routerDecl?.getInitializerIfKind(SyntaxKind.CallExpression);
  const arg = callExpr?.getArguments()[0];
  if (arg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    if (!obj.getProperty(lc))
      obj.addPropertyAssignment({ name: lc, initializer: `${lc}Router` });
  }
  file.saveSync();
  log.push("[MOD] packages/api/src/routers/index.ts");
}

export function unpatchRoutersIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.routersIndex)) return;
  const file =
    project.getSourceFile(PATHS.routersIndex) ??
    project.addSourceFileAtPath(PATHS.routersIndex);
  const routerDecl = file.getVariableDeclaration("appRouter");
  const callExpr = routerDecl?.getInitializerIfKind(SyntaxKind.CallExpression);
  const arg = callExpr?.getArguments()[0];
  if (arg?.isKind(SyntaxKind.ObjectLiteralExpression))
    arg
      .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getProperty(lc)
      ?.remove();
  removeNamedImport(file, `./${lc}.router`, `${lc}Router`);
  file.saveSync();
  log.push("[MOD] packages/api/src/routers/index.ts");
}

export function generateCustomUseCaseFile(
  moduleName: string,
  usecaseName: string,
  fields: FieldDef[],
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const capName = capitalize(usecaseName);
  const project = getProject();
  const filePath = join(PATHS.usecasesSrc, lcModule, `${lcName}.usecase.ts`);
  ensureDir(filePath);

  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);

  const file = project.createSourceFile(
    filePath,
    `import type { IUnitOfWork } from "@upstand/domain";\n` +
      `import { z } from "zod";\n\n` +
      `export const ${capName}InputSchema = z.object({\n${buildInputSchemaBody(fields)}\n});\n\n` +
      `export type ${capName}Input = z.infer<typeof ${capName}InputSchema>;\n\n` +
      `export class ${capName}UseCase {\n` +
      "  constructor(private readonly uow: IUnitOfWork) {}\n\n" +
      `  async execute(_input: ${capName}Input): Promise<any> {\n` +
      "    return this.uow.transaction(async (_tx) => {\n" +
      "      // Implement business logic here\n" +
      '      throw new Error("Implementation required");\n' +
      "    });\n" +
      "  }\n" +
      "}\n",
    { overwrite: true },
  );
  file.saveSync();
  log.push(`[NEW] packages/usecases/src/${lcModule}/${lcName}.usecase.ts`);
}

export function removeCustomUseCaseFile(
  moduleName: string,
  usecaseName: string,
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const filePath = join(PATHS.usecasesSrc, lcModule, `${lcName}.usecase.ts`);
  if (!existsSync(filePath)) return;
  const sf = getProject().getSourceFile(filePath);
  if (sf) getProject().removeSourceFile(sf);
  rmSync(filePath);
  log.push(`[DEL] packages/usecases/src/${lcModule}/${lcName}.usecase.ts`);
}

export function patchCustomUseCaseExport(
  moduleName: string,
  usecaseName: string,
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.usecasesIndex)) {
    ensureDir(PATHS.usecasesIndex);
    project
      .createSourceFile(
        PATHS.usecasesIndex,
        `export * from "./user/create-user.usecase";\n`,
      )
      .saveSync();
  }
  const file =
    project.getSourceFile(PATHS.usecasesIndex) ??
    project.addSourceFileAtPath(PATHS.usecasesIndex);
  const spec = `./${lcModule}/${lcName}.usecase`;
  const already = file
    .getExportDeclarations()
    .some((e) => e.getModuleSpecifierValue() === spec);
  if (!already) {
    file.addExportDeclaration({ moduleSpecifier: spec });
  }
  file.saveSync();
  log.push("[MOD] packages/usecases/src/index.ts");
}

export function unpatchCustomUseCaseExport(
  moduleName: string,
  usecaseName: string,
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.usecasesIndex)) return;
  const file =
    project.getSourceFile(PATHS.usecasesIndex) ??
    project.addSourceFileAtPath(PATHS.usecasesIndex);
  const spec = `./${lcModule}/${lcName}.usecase`;
  const decl = file
    .getExportDeclarations()
    .find((e) => e.getModuleSpecifierValue() === spec);
  if (decl) decl.remove();
  file.saveSync();
  log.push("[MOD] packages/usecases/src/index.ts");
}

export function patchCustomUseCaseDi(usecaseName: string, log: string[]): void {
  const cap = capitalize(usecaseName);
  const project = getProject();
  if (!existsSync(PATHS.diTs)) {
    ensureDir(PATHS.diTs);
  }
  const file =
    project.getSourceFile(PATHS.diTs) ??
    project.addSourceFileAtPath(PATHS.diTs);
  addNamedImport(file, "@upstand/usecases", `${cap}UseCase`);
  if (!file.getVariableDeclaration(`${cap}UseCaseToken`)) {
    const spIdx = serviceProviderIndex(file);
    file.insertStatements(spIdx, [
      `export const ${cap}UseCaseToken = createToken<${cap}UseCase>("${cap}UseCase");`,
    ]);
  }
  const alreadyRegistered = file
    .getStatements()
    .some(
      (s) =>
        s.getText().includes(`${cap}UseCaseToken`) &&
        s.getText().includes("addTransient"),
    );
  if (!alreadyRegistered) {
    const spIdx = serviceProviderIndex(file);
    file.insertStatements(spIdx, [
      `services.addTransient(${cap}UseCaseToken, (c) => new ${cap}UseCase(c.resolve(UnitOfWorkToken)));`,
    ]);
  }
  file.saveSync();
  log.push("[MOD] packages/api/src/di.ts");
}

export function unpatchCustomUseCaseDi(
  usecaseName: string,
  log: string[],
): void {
  const cap = capitalize(usecaseName);
  const project = getProject();
  if (!existsSync(PATHS.diTs)) return;
  const file =
    project.getSourceFile(PATHS.diTs) ??
    project.addSourceFileAtPath(PATHS.diTs);
  file
    .getVariableDeclaration(`${cap}UseCaseToken`)
    ?.getFirstAncestorByKind(SyntaxKind.VariableStatement)
    ?.remove();
  for (const stmt of [...file.getStatements()]) {
    const text = stmt.getText();
    if (text.includes(`${cap}UseCaseToken`) && text.includes("addTransient")) {
      stmt.remove();
    }
  }
  removeNamedImportAnywhere(file, `${cap}UseCase`);
  file.saveSync();
  log.push("[MOD] packages/api/src/di.ts");
}

export function patchCustomUseCaseRouter(
  moduleName: string,
  usecaseName: string,
  procedureAccess: "public" | "protected",
  procedureKind: "query" | "mutation",
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const capName = capitalize(usecaseName);
  const project = getProject();
  const filePath = join(PATHS.routersSrc, `${lcModule}.router.ts`);
  if (!existsSync(filePath)) {
    log.push(`[ERR] Router file not found: ${filePath}`);
    return;
  }
  const file =
    project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  const procedure =
    procedureAccess === "public" ? "publicProcedure" : "protectedProcedure";
  addNamedImport(file, "../index", procedure);
  addNamedImport(file, "../di", `${capName}UseCaseToken`);
  addNamedImport(file, "@upstand/usecases", `${capName}InputSchema`);

  const routerVar = file.getVariableDeclaration(`${lcModule}Router`);
  if (!routerVar) {
    log.push(`[ERR] Could not find ${lcModule}Router variable`);
    return;
  }
  const callExpr = routerVar.getInitializerIfKind(SyntaxKind.CallExpression);
  if (!callExpr) {
    log.push(`[ERR] ${lcModule}Router initializer is not a call expression`);
    return;
  }
  const arg = callExpr.getArguments()[0];
  if (!arg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    log.push("[ERR] Expected object literal as router() argument");
    return;
  }
  const routerObj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  if (routerObj.getProperty(lcName)) {
    log.push(
      `[SKIP] Procedure '${lcName}' already exists in ${lcModule}Router`,
    );
    return;
  }

  const inputLine = `    .input(${capName}InputSchema)\n`;
  const body = `    .${procedureKind}(async ({ ctx, input }) => {\n      const useCase = ctx.scope.resolve(${capName}UseCaseToken);\n      try {\n        return await useCase.execute(input);\n      } catch (error) {\n        handleUseCaseError(error);\n      }\n    })`;
  const initializer = `${procedure}\n${inputLine}${body}`;
  routerObj.addPropertyAssignment({ name: lcName, initializer });
  file.saveSync();
  log.push(
    `[MOD] packages/api/src/routers/${lcModule}.router.ts — added '${lcName}'`,
  );
}

export function unpatchCustomUseCaseRouter(
  moduleName: string,
  usecaseName: string,
  log: string[],
): void {
  const lcModule = moduleName.toLowerCase();
  const lcName = usecaseName.toLowerCase();
  const capName = capitalize(usecaseName);
  const project = getProject();
  const filePath = join(PATHS.routersSrc, `${lcModule}.router.ts`);
  if (!existsSync(filePath)) return;
  const file =
    project.getSourceFile(filePath) ?? project.addSourceFileAtPath(filePath);
  const routerVar = file.getVariableDeclaration(`${lcModule}Router`);
  const callExpr = routerVar?.getInitializerIfKind(SyntaxKind.CallExpression);
  const arg = callExpr?.getArguments()[0];
  if (arg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    arg
      .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getProperty(lcName)
      ?.remove();
  }
  removeNamedImport(file, "../di", `${capName}UseCaseToken`);
  removeNamedImport(file, "@upstand/usecases", `${capName}InputSchema`);
  file.saveSync();
  log.push(
    `[MOD] packages/api/src/routers/${lcModule}.router.ts — removed '${lcName}'`,
  );
}

export function generateDrizzleSchemaFile(
  config: ModuleConfig,
  log: string[],
): void {
  const lc = config.name.toLowerCase();
  const project = getProject();
  const filePath = join(PATHS.dbSchemaSrc, `${lc}.ts`);
  ensureDir(filePath);

  const stale = project.getSourceFile(filePath);
  if (stale) project.removeSourceFile(stale);

  const impList = getDrizzleImports(config.fields).join(", ");
  const body = buildDrizzleSchemaBody(config.fields);

  const file = project.createSourceFile(
    filePath,
    `import { ${impList} } from "drizzle-orm/pg-core";\n\nexport const ${lc} = pgTable("${lc}", {\n${body},\n});\n`,
    { overwrite: true },
  );

  file.saveSync();
  log.push(`[NEW] packages/db/src/schema/${lc}.ts`);
}

export function removeDrizzleSchemaFile(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const filePath = join(PATHS.dbSchemaSrc, `${lc}.ts`);
  if (!existsSync(filePath)) return;
  const sf = getProject().getSourceFile(filePath);
  if (sf) getProject().removeSourceFile(sf);
  rmSync(filePath);
  log.push(`[DEL] packages/db/src/schema/${lc}.ts`);
}

export function patchDbSchemaIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.dbSchemaIndex)) {
    ensureDir(PATHS.dbSchemaIndex);
    project
      .createSourceFile(
        PATHS.dbSchemaIndex,
        `export * from "./auth";\nexport * from "./product";\n`,
      )
      .saveSync();
    log.push(
      "[FIX] packages/db/src/schema/index.ts (recreated clean baseline)",
    );
  }
  const file =
    project.getSourceFile(PATHS.dbSchemaIndex) ??
    project.addSourceFileAtPath(PATHS.dbSchemaIndex);
  const spec = `./${lc}`;
  const already = file
    .getExportDeclarations()
    .some((e) => e.getModuleSpecifierValue() === spec);
  if (!already) {
    file.addExportDeclaration({ moduleSpecifier: spec });
  }
  file.saveSync();
  log.push("[MOD] packages/db/src/schema/index.ts");
}

export function unpatchDbSchemaIndex(name: string, log: string[]): void {
  const lc = name.toLowerCase();
  const project = getProject();
  if (!existsSync(PATHS.dbSchemaIndex)) return;
  const file =
    project.getSourceFile(PATHS.dbSchemaIndex) ??
    project.addSourceFileAtPath(PATHS.dbSchemaIndex);
  const spec = `./${lc}`;
  const decl = file
    .getExportDeclarations()
    .find((e) => e.getModuleSpecifierValue() === spec);
  if (decl) decl.remove();
  file.saveSync();
  log.push("[MOD] packages/db/src/schema/index.ts");
}

export function getActiveModules(): string[] {
  const dir = `${PATHS.domainSrc}/entities`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".ts") && f !== "user.ts")
    .map((f: string) => f.replace(".ts", ""))
    .sort();
}

export function getModuleUseCases(moduleName: string): string[] {
  const dir = join(PATHS.usecasesSrc, moduleName.toLowerCase());
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".usecase.ts"))
    .map((f) => f.replace(".usecase.ts", ""))
    .sort();
}
