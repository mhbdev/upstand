#!/usr/bin/env bun
/**
 * Upstand CLI — Interactive TUI + non-interactive CLI
 *
 * Non-interactive (pipe/CI):
 *   bun cli create <name>
 *   bun cli remove <name>
 *   bun cli check-types | db:generate | db:push | format
 *
 * Interactive (TTY):
 *   bun cli         → full OpenTUI command centre
 */

import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from "@opentui/core";
import { spawn } from "bun";
import * as gen from "./codegen/generate";
import { runMigration } from "./codegen/migrate";
import { createProjectSingleton } from "./codegen/project";
import { ROOT } from "./config";
import type { FieldDef, ModuleConfig, ZodTypeName } from "./types";

// ── Bootstrap ────────────────────────────────────────────────────────────────

createProjectSingleton();

let _renderer: Awaited<ReturnType<typeof createCliRenderer>> | null = null;

async function safeExit(code = 0): Promise<never> {
  try {
    if (_renderer) _renderer.destroy();
  } catch (_) {}
  process.exit(code);
}

process.on("SIGINT", () => void safeExit(0));
process.on("SIGTERM", () => void safeExit(0));

// ── Non-interactive mode ──────────────────────────────────────────────────────

async function runCLI(command: string, args: string[]): Promise<void> {
  const log: string[] = [];

  switch (command.toLowerCase()) {
    case "create": {
      const arg = args[0];
      if (!arg) {
        console.error("Usage: bun cli create <name>");
        process.exit(1);
      }
      runFullGenerate(
        { name: arg, fields: [], procedureAccess: "public" },
        log,
      );
      console.log(log.join("\n"));
      process.exit(0);
      break;
    }
    case "remove": {
      const arg = args[0];
      if (!arg) {
        console.error("Usage: bun cli remove <name>");
        process.exit(1);
      }
      runFullRemove(arg, log);
      console.log(log.join("\n"));
      process.exit(0);
      break;
    }
    case "add-usecase": {
      const [moduleName, usecaseName, access, kind] = args;
      if (!moduleName || !usecaseName) {
        console.error(
          "Usage: bun cli add-usecase <module> <usecase-name> [public|protected] [query|mutation]",
        );
        process.exit(1);
      }
      const procedureAccess = access === "protected" ? "protected" : "public";
      const procedureKind = kind === "query" ? "query" : "mutation";
      runUseCaseGenerate(
        moduleName,
        usecaseName,
        procedureAccess,
        procedureKind,
        [],
        log,
      );
      console.log(log.join("\n"));
      process.exit(0);
      break;
    }
    case "remove-usecase": {
      const [moduleName, usecaseName] = args;
      if (!moduleName || !usecaseName) {
        console.error("Usage: bun cli remove-usecase <module> <usecase-name>");
        process.exit(1);
      }
      runUseCaseRemove(moduleName, usecaseName, log);
      console.log(log.join("\n"));
      process.exit(0);
      break;
    }
    case "check-types":
      await spawn(["bun", "run", "check-types"], {
        stdout: "inherit",
        stderr: "inherit",
        cwd: ROOT,
      }).exited;
      process.exit(0);
      break;
    case "db:generate":
      await spawn(["bun", "run", "db:generate"], {
        stdout: "inherit",
        stderr: "inherit",
        cwd: ROOT,
      }).exited;
      process.exit(0);
      break;
    case "db:push":
      await spawn(["bun", "run", "db:push"], {
        stdout: "inherit",
        stderr: "inherit",
        cwd: ROOT,
      }).exited;
      process.exit(0);
      break;
    case "format":
    case "check":
      await spawn(["bun", "run", "check"], {
        stdout: "inherit",
        stderr: "inherit",
        cwd: ROOT,
      }).exited;
      process.exit(0);
      break;
    case "migrate": {
      const log: string[] = [];
      runMigration(log);
      console.log(log.join("\n"));
      process.exit(0);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Usage: bun cli [create|remove|add-usecase|remove-usecase|check-types|db:generate|db:push|format] [args]",
      );
      process.exit(1);
  }
}

const cmd = process.argv[2];
if (cmd) {
  await runCLI(cmd, process.argv.slice(3));
}

if (!process.stdout.isTTY) {
  console.error(
    "No TTY detected. Run bun cli [create|remove|...] for non-interactive use.",
  );
  process.exit(1);
}

// ── Orchestration helpers ─────────────────────────────────────────────────────

export function runFullGenerate(config: ModuleConfig, log: string[]): void {
  gen.generateDrizzleSchemaFile(config, log);
  gen.patchDbSchemaIndex(config.name, log);
  gen.generateEntityFile(config, log);
  gen.generateRepositoryInterfaceFile(config.name, log);
  gen.patchDomainIndex(config.name, log);
  gen.patchDomainTokens(config.name, log);
  gen.patchUnitOfWorkInterface(config.name, log);
  gen.generateUseCaseFile(config, log);
  gen.patchUseCasesIndex(config.name, log);
  gen.generateDrizzleRepositoryFile(config.name, log);
  gen.patchRepositoriesIndex(config.name, log);
  gen.patchDrizzleUnitOfWork(config.name, log);
  gen.generateRouterFile(config.name, config.procedureAccess, log);
  gen.patchDiTs(config.name, log);
  gen.patchRoutersIndex(config.name, log);
}

export function runFullRemove(name: string, log: string[]): void {
  gen.removeDrizzleSchemaFile(name, log);
  gen.unpatchDbSchemaIndex(name, log);
  gen.removeRouterFile(name, log);
  gen.unpatchRoutersIndex(name, log);
  gen.unpatchDiTs(name, log);
  gen.unpatchDrizzleUnitOfWork(name, log);
  gen.unpatchRepositoriesIndex(name, log);
  gen.removeRepositoryDirectory(name, log);
  gen.unpatchUseCasesIndex(name, log);
  gen.removeUseCaseDirectory(name, log);
  gen.unpatchUnitOfWorkInterface(name, log);
  gen.unpatchDomainTokens(name, log);
  gen.unpatchDomainIndex(name, log);
  gen.removeRepositoryInterfaceFile(name, log);
  gen.removeEntityFile(name, log);
}

export function runUseCaseGenerate(
  moduleName: string,
  usecaseName: string,
  procedureAccess: "public" | "protected",
  procedureKind: "query" | "mutation",
  fields: FieldDef[],
  log: string[],
): void {
  gen.generateCustomUseCaseFile(moduleName, usecaseName, fields, log);
  gen.patchCustomUseCaseExport(moduleName, usecaseName, log);
  gen.patchCustomUseCaseDi(usecaseName, log);
  gen.patchCustomUseCaseRouter(
    moduleName,
    usecaseName,
    procedureAccess,
    procedureKind,
    log,
  );
}

export function runUseCaseRemove(
  moduleName: string,
  usecaseName: string,
  log: string[],
): void {
  gen.unpatchCustomUseCaseRouter(moduleName, usecaseName, log);
  gen.unpatchCustomUseCaseDi(usecaseName, log);
  gen.unpatchCustomUseCaseExport(moduleName, usecaseName, log);
  gen.removeCustomUseCaseFile(moduleName, usecaseName, log);
}

// ── Interactive TUI ───────────────────────────────────────────────────────────

const renderer = await createCliRenderer({ exitOnCtrlC: true });
_renderer = renderer;

// ── Layout ────────────────────────────────────────────────────────────────────

const rootBox = new BoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  flexDirection: "column",
  padding: 1,
});

const titleBar = new BoxRenderable(renderer, {
  width: "100%",
  height: 3,
  flexDirection: "row",
  alignItems: "center",
  borderStyle: "single",
  borderColor: "#2563eb",
  paddingX: 2,
});
const titleText = new TextRenderable(renderer, {
  content: "⬡  Upstand CLI",
  fg: "#93c5fd",
});
titleBar.add(titleText);
rootBox.add(titleBar);

const body = new BoxRenderable(renderer, {
  width: "100%",
  flexGrow: 1,
  flexDirection: "row",
  marginTop: 1,
});

const leftPane = new BoxRenderable(renderer, {
  width: "40%",
  height: "100%",
  flexDirection: "column",
  borderStyle: "rounded",
  borderColor: "#10b981",
  title: " Commands ",
  titleAlignment: "center",
  padding: 1,
});

const rightPane = new BoxRenderable(renderer, {
  width: "60%",
  height: "100%",
  flexDirection: "column",
  borderStyle: "rounded",
  borderColor: "#7c3aed",
  title: " Live Output ",
  titleAlignment: "center",
  padding: 1,
});

const outputScroll = new ScrollBoxRenderable(renderer, {
  width: "100%",
  height: "100%",
  stickyScroll: true,
  stickyStart: "bottom",
});
const outputLog = new TextRenderable(renderer, {
  content: "Ready — select a command.\n",
  flexGrow: 1,
});
outputScroll.add(outputLog);
rightPane.add(outputScroll);

body.add(leftPane);
body.add(rightPane);
rootBox.add(body);

const footer = new BoxRenderable(renderer, {
  width: "100%",
  height: 1,
  flexDirection: "row",
  alignItems: "center",
  paddingX: 2,
});
const footerText = new TextRenderable(renderer, {
  content: "↑↓ Navigate   Enter Select   Esc Back   Ctrl+C Quit",
  fg: "#6b7280",
});
footer.add(footerText);
rootBox.add(footer);

renderer.root.add(rootBox);
renderer.start();

// ── Log pane helpers ──────────────────────────────────────────────────────────

const appendLog = (s: string) => {
  outputLog.content = outputLog.content + s;
  renderer.requestRender();
};

const clearLog = (initial = "") => {
  outputLog.content = initial;
  renderer.requestRender();
};

// ── Title refresh ─────────────────────────────────────────────────────────────

const refreshTitle = () => {
  const mods = gen.getActiveModules();
  const modList = mods.length ? mods.join(", ") : "none";
  titleText.content = `⬡  Upstand CLI — [${modList}]`;
  renderer.requestRender();
};

refreshTitle();

// ── Pane helpers ──────────────────────────────────────────────────────────────

const clearLeft = () => {
  for (const c of [...leftPane.getChildren()]) leftPane.remove(c);
};

const setLeftTitle = (title: string) => {
  leftPane.title = ` ${title} `;
};

// ── Escape key handler (per-view, cleans up itself) ───────────────────────────

type EscapeCleaner = () => void;

function onEscape(fn: () => void): EscapeCleaner {
  const handler = (key: { name: string }) => {
    if (key.name === "escape") {
      cleanup();
      fn();
    }
  };
  renderer.keyInput.on("keypress", handler);
  const cleanup: EscapeCleaner = () =>
    renderer.keyInput.off("keypress", handler);
  return cleanup;
}

// ── Live process runner ───────────────────────────────────────────────────────

async function runLive(args: string[]): Promise<void> {
  clearLog(`$ ${args.join(" ")}\n`);
  const proc = spawn(args, { stdout: "pipe", stderr: "pipe", cwd: ROOT });
  const dec = new TextDecoder();
  const pipe = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) appendLog(dec.decode(chunk));
  };
  await Promise.all([pipe(proc.stdout), pipe(proc.stderr)]);
  const code = await proc.exited;
  appendLog(`\n── exited with code ${code} ──\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Main menu ─────────────────────────────────────────────────────────────────

const showMainMenu = () => {
  clearLeft();
  setLeftTitle("Commands");

  const options = [
    {
      name: "✦ Create Module",
      description: "Scaffold all clean-arch layers",
      value: "create",
    },
    {
      name: "✦ Add Use Case",
      description: "Generate & wire new usecase + API endpoint",
      value: "add-usecase",
    },
    {
      name: "✕ Remove Use Case",
      description: "Delete & de-wire a usecase + API endpoint",
      value: "remove-usecase",
    },
    {
      name: "✕ Remove Module",
      description: "Delete + de-wire a module",
      value: "remove",
    },
    {
      name: "⚙ Migrate (once)",
      description: "Strip old markers & stale test modules",
      value: "migrate",
    },
    {
      name: "⊕ DB Migrate",
      description: "drizzle-kit generate",
      value: "db-generate",
    },
    { name: "⊕ DB Push", description: "drizzle-kit push", value: "push" },
    {
      name: "✓ Format & Lint",
      description: "biome check --write",
      value: "format",
    },
    {
      name: "✓ Validate Types",
      description: "tsc --noEmit all packages",
      value: "types",
    },
    { name: "× Exit", description: "Quit the CLI", value: "exit" },
  ];

  const menu = new SelectRenderable(renderer, {
    options,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    wrapSelection: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    selectedTextColor: "#ffffff",
    height: options.length + 1,
  });
  leftPane.add(menu);
  renderer.requestRender();
  menu.focus();

  menu.on(
    SelectRenderableEvents.ITEM_SELECTED,
    async (_idx: number, option: { value: string }) => {
      switch (option.value) {
        case "exit":
          return safeExit(0);
        case "create":
          return showCreateWizard();
        case "add-usecase":
          return showAddUseCaseWizard();
        case "remove-usecase":
          return showRemoveUseCaseWizard();
        case "remove":
          return showRemoveView();
        case "migrate": {
          clearLog("Running migration…\n");
          const log: string[] = [];
          try {
            runMigration(log);
          } catch (e) {
            log.push(`[ERR] ${String(e)}`);
          }
          appendLog(`${log.join("\n")}\n`);
          return showMainMenu();
        }
        case "db-generate":
          await runLive(["bun", "run", "db:generate"]);
          return showMainMenu();
        case "push":
          await runLive(["bun", "run", "db:push"]);
          return showMainMenu();
        case "format":
          await runLive(["bun", "run", "check"]);
          return showMainMenu();
        case "types":
          await runLive(["bun", "run", "check-types"]);
          return showMainMenu();
      }
    },
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE MODULE — multi-step wizard
// ═══════════════════════════════════════════════════════════════════════════════

const showCreateWizard = () => {
  const state: ModuleConfig = {
    name: "",
    fields: [],
    procedureAccess: "public",
  };
  showCreateStep1(state);
};

// Step 1 ── Module name
const showCreateStep1 = (state: ModuleConfig) => {
  clearLeft();
  setLeftTitle("Create Module");
  clearLog(
    "Enter a module name (e.g. 'order', 'invoice').\n\nBuilt-in fields added automatically:\n  • id (uuid)\n  • createdAt (date)\n  • updatedAt (date)\n",
  );

  leftPane.add(
    new TextRenderable(renderer, { content: "Module name:\n", fg: "#10b981" }),
  );
  const input = new InputRenderable(renderer, {
    placeholder: "e.g. order",
    value: state.name,
    width: "100%",
    focusedBackgroundColor: "#064e3b",
  });
  leftPane.add(input);
  leftPane.add(
    new TextRenderable(renderer, {
      content: "\n[Enter] next   [Esc] main menu",
      fg: "#6b7280",
    }),
  );
  renderer.requestRender();
  input.focus();

  const cleanup = onEscape(() => showMainMenu());

  input.on(InputRenderableEvents.ENTER, (val: string) => {
    cleanup();
    const name = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!name) {
      appendLog(
        "[!] Name cannot be empty or contain non-alphanumeric characters.\n",
      );
      return;
    }
    state.name = name;
    showCreateStep2(state);
  });
};

// Step 2 ── Entity fields (repeating)
const showCreateStep2 = (state: ModuleConfig) => {
  const renderFieldList = () => {
    const header = `Module: ${state.name}\n\nFields (add empty name to finish):\n`;
    const builtins =
      "  • id         : uuid     (auto)\n  • createdAt  : date     (auto)\n  • updatedAt  : date     (auto)\n";
    const custom = state.fields.length
      ? `${state.fields
          .map(
            (f) =>
              `  • ${f.name.padEnd(12)}: ${f.zodType.padEnd(8)} (${f.optional ? "optional" : "required"})`,
          )
          .join("\n")}\n`
      : "";
    clearLog(header + builtins + custom);
  };

  const promptFieldName = () => {
    clearLeft();
    setLeftTitle("Create Module · Fields");
    renderFieldList();

    leftPane.add(
      new TextRenderable(renderer, {
        content: "Field name (empty = done):\n",
        fg: "#10b981",
      }),
    );
    const input = new InputRenderable(renderer, {
      placeholder: "e.g. amount",
      value: "",
      width: "100%",
      focusedBackgroundColor: "#064e3b",
    });
    leftPane.add(input);
    leftPane.add(
      new TextRenderable(renderer, {
        content: "\n[Enter] add   [Esc] back",
        fg: "#6b7280",
      }),
    );
    renderer.requestRender();
    input.focus();

    const cleanup = onEscape(() => showCreateStep1(state));

    input.on(InputRenderableEvents.ENTER, (val: string) => {
      cleanup();
      const fieldName = val
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
      if (!fieldName) {
        // Done adding fields, move to step 3
        showCreateStep3(state);
        return;
      }
      promptFieldType(fieldName);
    });
  };

  const promptFieldType = (fieldName: string) => {
    clearLeft();
    setLeftTitle("Create Module · Field Type");
    renderFieldList();
    appendLog(`\nConfiguring field: ${fieldName}\n`);

    const typeOptions: {
      name: string;
      description: string;
      value: ZodTypeName;
    }[] = [
      { name: "string", description: "z.string()", value: "string" },
      { name: "number", description: "z.number()", value: "number" },
      { name: "boolean", description: "z.boolean()", value: "boolean" },
      { name: "date", description: "z.date()", value: "date" },
      { name: "uuid", description: "z.uuid()", value: "uuid" },
      { name: "json", description: "z.any()", value: "json" },
      { name: "email", description: "z.email()", value: "email" },
    ];

    leftPane.add(
      new TextRenderable(renderer, {
        content: `Type for '${fieldName}':\n`,
        fg: "#10b981",
      }),
    );
    const sel = new SelectRenderable(renderer, {
      options: typeOptions,
      selectedIndex: 0,
      showSelectionIndicator: true,
      showDescription: true,
      wrapSelection: true,
      focusedBackgroundColor: "#1e3a5f",
      focusedTextColor: "#93c5fd",
      selectedBackgroundColor: "#1d4ed8",
      height: typeOptions.length + 1,
    });
    leftPane.add(sel);
    leftPane.add(
      new TextRenderable(renderer, {
        content: "\n[Esc] back to name",
        fg: "#6b7280",
      }),
    );
    renderer.requestRender();
    sel.focus();

    const cleanup = onEscape(() => promptFieldName());

    sel.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_idx: number, opt: { value: ZodTypeName }) => {
        cleanup();
        promptFieldOptional(fieldName, opt.value);
      },
    );
  };

  const promptFieldOptional = (fieldName: string, zodType: ZodTypeName) => {
    clearLeft();
    setLeftTitle("Create Module · Required?");

    const optOptions = [
      {
        name: "Required",
        description: "field must always be provided",
        value: "required",
      },
      {
        name: "Optional",
        description: "field may be omitted (.optional())",
        value: "optional",
      },
    ];

    leftPane.add(
      new TextRenderable(renderer, {
        content: `Is '${fieldName}' required?\n`,
        fg: "#10b981",
      }),
    );
    const sel = new SelectRenderable(renderer, {
      options: optOptions,
      selectedIndex: 0,
      showSelectionIndicator: true,
      showDescription: true,
      focusedBackgroundColor: "#1e3a5f",
      focusedTextColor: "#93c5fd",
      selectedBackgroundColor: "#1d4ed8",
      height: 3,
    });
    leftPane.add(sel);
    leftPane.add(
      new TextRenderable(renderer, {
        content: "\n[Esc] back to type",
        fg: "#6b7280",
      }),
    );
    renderer.requestRender();
    sel.focus();

    const cleanup = onEscape(() => promptFieldType(fieldName));

    sel.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_idx: number, opt: { value: string }) => {
        cleanup();
        const field: FieldDef = {
          name: fieldName,
          zodType,
          optional: opt.value === "optional",
        };
        state.fields.push(field);
        promptFieldName(); // loop back for next field
      },
    );
  };

  promptFieldName();
};

// Step 3 ── Procedure access
const showCreateStep3 = (state: ModuleConfig) => {
  clearLeft();
  setLeftTitle("Create Module · Access");

  const opts = [
    {
      name: "publicProcedure",
      description: "Anyone can call — no auth required",
      value: "public",
    },
    {
      name: "protectedProcedure",
      description: "Requires authenticated session",
      value: "protected",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Procedure access level:\n",
      fg: "#10b981",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: 3,
  });
  leftPane.add(sel);
  leftPane.add(
    new TextRenderable(renderer, {
      content: "\n[Esc] back to fields",
      fg: "#6b7280",
    }),
  );
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showCreateStep2(state));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      state.procedureAccess = opt.value as "public" | "protected";
      showCreateStep4(state);
    },
  );
};

// Step 4 ── Summary + confirm
const showCreateStep4 = (state: ModuleConfig) => {
  clearLeft();
  setLeftTitle("Create Module · Confirm");

  const cap = state.name.charAt(0).toUpperCase() + state.name.slice(1);
  const fieldSummary = state.fields.length
    ? state.fields
        .map(
          (f) =>
            `  • ${f.name.padEnd(14)}: ${f.zodType}${f.optional ? " (optional)" : ""}`,
        )
        .join("\n")
    : "  (none — built-ins only: id, createdAt, updatedAt)";

  clearLog(
    "━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━\n" +
      `  Module   : ${cap}\n` +
      `  Access   : ${state.procedureAccess}Procedure\n` +
      `  Fields   :\n${fieldSummary}\n\n` +
      "Files to create:\n" +
      `  packages/domain/src/entities/${state.name}.ts\n` +
      `  packages/domain/src/repositories/${state.name}-repository.interface.ts\n` +
      `  packages/usecases/src/${state.name}/create-${state.name}.usecase.ts\n` +
      `  packages/repositories/src/${state.name}/drizzle-${state.name}.repository.ts\n` +
      `  packages/api/src/routers/${state.name}.router.ts\n\n` +
      "Files to patch:\n" +
      "  packages/domain/src/index.ts, tokens.ts, unit-of-work.interface.ts\n" +
      "  packages/usecases/src/index.ts\n" +
      "  packages/repositories/src/index.ts, drizzle-unit-of-work.ts\n" +
      "  packages/api/src/di.ts, routers/index.ts\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
  );

  const confirmOpts = [
    { name: "✓ Generate", description: "Create all files now", value: "go" },
    { name: "← Back", description: "Go back to access step", value: "back" },
    { name: "✕ Cancel", description: "Return to main menu", value: "cancel" },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Ready to generate:\n",
      fg: "#10b981",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: confirmOpts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: 4,
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showCreateStep3(state));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "back") return showCreateStep3(state);
      if (opt.value === "cancel") return showMainMenu();

      clearLog("Generating...\n");
      const log: string[] = [];
      try {
        runFullGenerate(state, log);
        appendLog(`${log.join("\n")}\n\n[✓] Module generated successfully.\n`);
        refreshTitle();
      } catch (err) {
        appendLog(`\n[ERR] ${String(err)}\n`);
      }
      showMainMenu();
    },
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// REMOVE MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const showRemoveView = () => {
  const modules = gen.getActiveModules();
  clearLeft();
  setLeftTitle("Remove Module");

  if (!modules.length) {
    clearLog("No CLI-managed modules found.\n");
    leftPane.add(
      new TextRenderable(renderer, {
        content: "No modules found.\n\n[Esc] back",
        fg: "#ef4444",
      }),
    );
    const phantom = new InputRenderable(renderer, {
      value: "",
      visible: false,
    });
    leftPane.add(phantom);
    phantom.focus();
    const cleanup = onEscape(() => showMainMenu());
    phantom.onKeyDown = () => {
      cleanup();
      showMainMenu();
    };
    renderer.requestRender();
    return;
  }

  const opts = [
    ...modules.map((m) => ({
      name: m.charAt(0).toUpperCase() + m.slice(1),
      description: `Delete all layers for '${m}'`,
      value: m,
    })),
    { name: "← Back", description: "Return to main menu", value: "__back__" },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Select module to remove:\n",
      fg: "#ef4444",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    wrapSelection: true,
    focusedBackgroundColor: "#450a0a",
    focusedTextColor: "#fca5a5",
    selectedBackgroundColor: "#991b1b",
    selectedTextColor: "#ffffff",
    height: Math.min(opts.length + 1, 12),
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showMainMenu());

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      if (opt.value === "__back__") {
        cleanup();
        return showMainMenu();
      }
      showConfirmRemove(opt.value, cleanup);
    },
  );
};

const showConfirmRemove = (modName: string, parentCleanup: EscapeCleaner) => {
  clearLeft();
  setLeftTitle("Remove Module · Confirm");
  clearLog(
    `About to permanently remove module '${modName}'.\n\n` +
      "This will:\n" +
      "  • Delete entity, repository interface, use-case, Drizzle repo, and router files\n" +
      "  • Remove all references from DI, UoW, and barrel index files\n\n" +
      "This action cannot be undone.\n",
  );

  const opts = [
    { name: "← No, go back", description: "Keep the module", value: "cancel" },
    {
      name: "✕ Yes, delete it",
      description: "Permanently remove everything",
      value: "confirm",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: `Delete '${modName}'?\n`,
      fg: "#ef4444",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#78350f",
    focusedTextColor: "#fde68a",
    selectedBackgroundColor: "#b45309",
    selectedTextColor: "#ffffff",
    height: 3,
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => {
    parentCleanup();
    showRemoveView();
  });

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      parentCleanup();
      if (opt.value === "cancel") return showRemoveView();

      clearLog(`Removing '${modName}'...\n`);
      const log: string[] = [];
      try {
        runFullRemove(modName, log);
        appendLog(`${log.join("\n")}\n\n[✓] Module removed.\n`);
        refreshTitle();
      } catch (err) {
        appendLog(`\n[ERR] ${String(err)}\n`);
      }
      showMainMenu();
    },
  );
};

interface AddUseCaseState {
  moduleName: string;
  usecaseName: string;
  procedureAccess: "public" | "protected";
  procedureKind: "query" | "mutation";
  fields: FieldDef[];
}

const showAddUseCaseWizard = () => {
  const modules = gen.getActiveModules();
  if (!modules.length) {
    clearLog("No modules found. Create a module first.\n");
    showMainMenu();
    return;
  }

  const state: AddUseCaseState = {
    moduleName: "",
    usecaseName: "",
    procedureAccess: "public",
    procedureKind: "mutation",
    fields: [],
  };

  showAddUseCaseStep1(state, modules);
};

const showAddUseCaseStep1 = (state: AddUseCaseState, modules: string[]) => {
  clearLeft();
  setLeftTitle("Add Use Case · Module");
  clearLog("Select the module to add this use case to.\n");

  const opts = [
    ...modules.map((m) => ({
      name: m.charAt(0).toUpperCase() + m.slice(1),
      description: `Add to ${m} module`,
      value: m,
    })),
    { name: "← Back", description: "Return to main menu", value: "__back__" },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Select module:\n",
      fg: "#10b981",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    wrapSelection: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: Math.min(opts.length + 1, 12),
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showMainMenu());

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "__back__") return showMainMenu();
      state.moduleName = opt.value;
      showAddUseCaseStep2(state);
    },
  );
};

const showAddUseCaseStep2 = (state: AddUseCaseState) => {
  clearLeft();
  setLeftTitle("Add Use Case · Name");
  clearLog(
    `Adding use case to: ${state.moduleName} module\n\nExamples: listInvoices, publishPost, archiveOrder\n`,
  );

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Use case name:\n",
      fg: "#10b981",
    }),
  );
  const input = new InputRenderable(renderer, {
    placeholder: "e.g. listInvoices",
    value: state.usecaseName,
    width: "100%",
    focusedBackgroundColor: "#064e3b",
  });
  leftPane.add(input);
  leftPane.add(
    new TextRenderable(renderer, {
      content: "\n[Enter] next   [Esc] back",
      fg: "#6b7280",
    }),
  );
  renderer.requestRender();
  input.focus();

  const cleanup = onEscape(() =>
    showAddUseCaseStep1(state, gen.getActiveModules()),
  );

  input.on(InputRenderableEvents.ENTER, (val: string) => {
    cleanup();
    const name = val.trim().replace(/[^a-zA-Z0-9]/g, "");
    if (!name) {
      appendLog("[!] Use case name cannot be empty.\n");
      return;
    }
    state.usecaseName = name;
    showAddUseCaseStep3(state);
  });
};

const showAddUseCaseStep3 = (state: AddUseCaseState) => {
  clearLeft();
  setLeftTitle("Add Use Case · Access");

  const opts = [
    {
      name: "publicProcedure",
      description: "No auth required",
      value: "public",
    },
    {
      name: "protectedProcedure",
      description: "Requires session",
      value: "protected",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, { content: "Access level:\n", fg: "#10b981" }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: state.procedureAccess === "public" ? 0 : 1,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: 3,
  });
  leftPane.add(sel);
  leftPane.add(
    new TextRenderable(renderer, { content: "\n[Esc] back", fg: "#6b7280" }),
  );
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showAddUseCaseStep2(state));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      state.procedureAccess = opt.value as "public" | "protected";
      showAddUseCaseStep4(state);
    },
  );
};

const showAddUseCaseStep4 = (state: AddUseCaseState) => {
  clearLeft();
  setLeftTitle("Add Use Case · Kind");

  const opts = [
    { name: "query", description: "Read-only — fetches data", value: "query" },
    {
      name: "mutation",
      description: "Write — creates/updates/deletes",
      value: "mutation",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Procedure kind:\n",
      fg: "#10b981",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: state.procedureKind === "query" ? 0 : 1,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: 3,
  });
  leftPane.add(sel);
  leftPane.add(
    new TextRenderable(renderer, { content: "\n[Esc] back", fg: "#6b7280" }),
  );
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showAddUseCaseStep3(state));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      state.procedureKind = opt.value as "query" | "mutation";
      showAddUseCaseStep5(state);
    },
  );
};

const showAddUseCaseStep5 = (state: AddUseCaseState) => {
  const renderFieldList = () => {
    const header = `Module: ${state.moduleName}\nUseCase: ${state.usecaseName}\n\nFields (add empty name to finish):\n`;
    const custom = state.fields.length
      ? `${state.fields
          .map(
            (f) =>
              `  • ${f.name.padEnd(12)}: ${f.zodType.padEnd(8)} (${f.optional ? "optional" : "required"})`,
          )
          .join("\n")}\n`
      : "";
    clearLog(header + custom);
  };

  const promptFieldName = () => {
    clearLeft();
    setLeftTitle("Add Use Case · Fields");
    renderFieldList();

    leftPane.add(
      new TextRenderable(renderer, {
        content: "Field name (empty = done):\n",
        fg: "#10b981",
      }),
    );
    const input = new InputRenderable(renderer, {
      placeholder: "e.g. name, count",
      value: "",
      width: "100%",
      focusedBackgroundColor: "#064e3b",
    });
    leftPane.add(input);
    leftPane.add(
      new TextRenderable(renderer, {
        content: "\n[Enter] next   [Esc] back",
        fg: "#6b7280",
      }),
    );
    renderer.requestRender();
    input.focus();

    const cleanup = onEscape(() => {
      if (state.fields.length > 0) {
        state.fields.pop();
        promptFieldName();
      } else {
        showAddUseCaseStep4(state);
      }
    });

    input.on(InputRenderableEvents.ENTER, (val: string) => {
      cleanup();
      const name = val.trim().replace(/[^a-zA-Z0-9]/g, "");
      if (!name) {
        showAddUseCaseConfirm(state);
        return;
      }
      promptFieldType(name);
    });
  };

  const promptFieldType = (fieldName: string) => {
    clearLeft();
    setLeftTitle("Add Use Case · Field Type");
    renderFieldList();
    appendLog(`\nConfiguring field: ${fieldName}\n`);

    const typeOptions: {
      name: string;
      description: string;
      value: ZodTypeName;
    }[] = [
      { name: "string", description: "z.string()", value: "string" },
      { name: "number", description: "z.number()", value: "number" },
      { name: "boolean", description: "z.boolean()", value: "boolean" },
      { name: "date", description: "z.date()", value: "date" },
      { name: "uuid", description: "z.uuid()", value: "uuid" },
      { name: "json", description: "z.any()", value: "json" },
      { name: "email", description: "z.string().email()", value: "email" },
    ];

    leftPane.add(
      new TextRenderable(renderer, {
        content: `Type for '${fieldName}':\n`,
        fg: "#10b981",
      }),
    );
    const sel = new SelectRenderable(renderer, {
      options: typeOptions,
      selectedIndex: 0,
      showSelectionIndicator: true,
      showDescription: true,
      wrapSelection: true,
      focusedBackgroundColor: "#1e3a5f",
      focusedTextColor: "#93c5fd",
      selectedBackgroundColor: "#1d4ed8",
      height: typeOptions.length + 1,
    });
    leftPane.add(sel);
    leftPane.add(
      new TextRenderable(renderer, { content: "\n[Esc] back", fg: "#6b7280" }),
    );
    renderer.requestRender();
    sel.focus();

    const cleanup = onEscape(() => promptFieldName());

    sel.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_idx: number, opt: { value: ZodTypeName }) => {
        cleanup();
        promptFieldOptional(fieldName, opt.value);
      },
    );
  };

  const promptFieldOptional = (fieldName: string, type: ZodTypeName) => {
    clearLeft();
    setLeftTitle("Add Use Case · Required?");
    renderFieldList();
    appendLog(`\nConfiguring field: ${fieldName} (${type})\n`);

    const opts = [
      {
        name: "Yes (required)",
        description: "Field is required",
        value: "req",
      },
      {
        name: "No (optional)",
        description: "Field can be omitted/null",
        value: "opt",
      },
    ];

    leftPane.add(
      new TextRenderable(renderer, {
        content: `Is '${fieldName}' optional?\n`,
        fg: "#10b981",
      }),
    );
    const sel = new SelectRenderable(renderer, {
      options: opts,
      selectedIndex: 0,
      showSelectionIndicator: true,
      showDescription: true,
      focusedBackgroundColor: "#1e3a5f",
      focusedTextColor: "#93c5fd",
      selectedBackgroundColor: "#1d4ed8",
      height: 3,
    });
    leftPane.add(sel);
    leftPane.add(
      new TextRenderable(renderer, { content: "\n[Esc] back", fg: "#6b7280" }),
    );
    renderer.requestRender();
    sel.focus();

    const cleanup = onEscape(() => promptFieldType(fieldName));

    sel.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_idx: number, opt: { value: string }) => {
        cleanup();
        state.fields.push({
          name: fieldName,
          zodType: type,
          optional: opt.value === "opt",
        });
        promptFieldName();
      },
    );
  };

  promptFieldName();
};

const showAddUseCaseConfirm = (state: AddUseCaseState) => {
  clearLeft();
  setLeftTitle("Add Use Case · Confirm");
  clearLog(
    "━━━ Add Use Case Summary ━━━━━━━━━━━━\n" +
      `  Module    : ${state.moduleName}\n` +
      `  UseCase   : ${state.usecaseName}\n` +
      `  Access    : ${state.procedureAccess}Procedure\n` +
      `  Kind      : ${state.procedureKind}\n` +
      `  Fields    : ${state.fields.length} custom input fields\n\n` +
      "Will generate:\n" +
      `  packages/usecases/src/${state.moduleName.toLowerCase()}/${state.usecaseName.toLowerCase()}.usecase.ts\n` +
      "Will patch:\n" +
      "  packages/usecases/src/index.ts\n" +
      "  packages/api/src/di.ts\n" +
      `  packages/api/src/routers/${state.moduleName.toLowerCase()}.router.ts\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
  );

  const opts = [
    { name: "✓ Generate", description: "Write & patch files now", value: "go" },
    { name: "← Back", description: "Back to fields step", value: "back" },
    {
      name: "✕ Cancel",
      description: "Cancel and return to menu",
      value: "cancel",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Ready to generate usecase?\n",
      fg: "#10b981",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#1e3a5f",
    focusedTextColor: "#93c5fd",
    selectedBackgroundColor: "#1d4ed8",
    height: 4,
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showAddUseCaseStep5(state));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "back") return showAddUseCaseStep5(state);
      if (opt.value === "cancel") return showMainMenu();

      clearLog("Generating usecase...\n");
      const log: string[] = [];
      try {
        runUseCaseGenerate(
          state.moduleName,
          state.usecaseName,
          state.procedureAccess,
          state.procedureKind,
          state.fields,
          log,
        );
        appendLog(`${log.join("\n")}\n\n[✓] Use case successfully created!\n`);
      } catch (err) {
        appendLog(`\n[ERR] ${String(err)}\n`);
      }
      showMainMenu();
    },
  );
};

const showRemoveUseCaseWizard = () => {
  const modules = gen.getActiveModules();
  clearLeft();
  setLeftTitle("Remove Use Case");

  if (!modules.length) {
    clearLog("No modules found.\n");
    showMainMenu();
    return;
  }

  const opts = [
    ...modules.map((m) => ({
      name: m.charAt(0).toUpperCase() + m.slice(1),
      description: `Remove use case from '${m}'`,
      value: m,
    })),
    { name: "← Back", description: "Return to main menu", value: "__back__" },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: "Select module to remove use case from:\n",
      fg: "#ef4444",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    wrapSelection: true,
    focusedBackgroundColor: "#450a0a",
    focusedTextColor: "#fca5a5",
    selectedBackgroundColor: "#991b1b",
    selectedTextColor: "#ffffff",
    height: Math.min(opts.length + 1, 12),
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showMainMenu());

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "__back__") return showMainMenu();
      showRemoveUseCaseStep2(opt.value);
    },
  );
};

const showRemoveUseCaseStep2 = (moduleName: string) => {
  const usecases = gen.getModuleUseCases(moduleName);
  clearLeft();
  setLeftTitle(
    `Remove Use Case · ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
  );

  if (!usecases.length) {
    clearLog(`No use cases found in module '${moduleName}'.\n`);
    leftPane.add(
      new TextRenderable(renderer, {
        content: `No use cases found in '${moduleName}'.\n\n[Esc] back`,
        fg: "#ef4444",
      }),
    );
    const phantom = new InputRenderable(renderer, {
      value: "",
      visible: false,
    });
    leftPane.add(phantom);
    phantom.focus();
    const cleanup = onEscape(() => showRemoveUseCaseWizard());
    phantom.onKeyDown = () => {
      cleanup();
      showRemoveUseCaseWizard();
    };
    renderer.requestRender();
    return;
  }

  const opts = [
    ...usecases.map((uc) => ({
      name: uc,
      description: `Delete and de-wire '${uc}'`,
      value: uc,
    })),
    { name: "← Back", description: "Select another module", value: "__back__" },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: `Select use case to remove from '${moduleName}':\n`,
      fg: "#ef4444",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    wrapSelection: true,
    focusedBackgroundColor: "#450a0a",
    focusedTextColor: "#fca5a5",
    selectedBackgroundColor: "#991b1b",
    selectedTextColor: "#ffffff",
    height: Math.min(opts.length + 1, 12),
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showRemoveUseCaseWizard());

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "__back__") return showRemoveUseCaseWizard();
      showConfirmRemoveUseCase(moduleName, opt.value);
    },
  );
};

const showConfirmRemoveUseCase = (moduleName: string, usecaseName: string) => {
  clearLeft();
  setLeftTitle("Remove Use Case · Confirm");
  clearLog(
    `About to permanently remove use case '${usecaseName}' from module '${moduleName}'.\n\n` +
      "This will:\n" +
      `  • Delete packages/usecases/src/${moduleName.toLowerCase()}/${usecaseName.toLowerCase()}.usecase.ts\n` +
      "  • Remove imports and bindings from index.ts, di.ts, and router files\n\n" +
      "This action cannot be undone.\n",
  );

  const opts = [
    { name: "← No, keep it", description: "Return to list", value: "cancel" },
    {
      name: "✕ Yes, delete it",
      description: "Permanently remove this use case",
      value: "confirm",
    },
  ];

  leftPane.add(
    new TextRenderable(renderer, {
      content: `Delete usecase '${usecaseName}'?\n`,
      fg: "#ef4444",
    }),
  );
  const sel = new SelectRenderable(renderer, {
    options: opts,
    selectedIndex: 0,
    showSelectionIndicator: true,
    showDescription: true,
    focusedBackgroundColor: "#78350f",
    focusedTextColor: "#fde68a",
    selectedBackgroundColor: "#b45309",
    selectedTextColor: "#ffffff",
    height: 3,
  });
  leftPane.add(sel);
  renderer.requestRender();
  sel.focus();

  const cleanup = onEscape(() => showRemoveUseCaseStep2(moduleName));

  sel.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_idx: number, opt: { value: string }) => {
      cleanup();
      if (opt.value === "cancel") return showRemoveUseCaseStep2(moduleName);

      clearLog(`Removing usecase '${usecaseName}'...\n`);
      const log: string[] = [];
      try {
        runUseCaseRemove(moduleName, usecaseName, log);
        appendLog(`${log.join("\n")}\n\n[✓] Use case removed.\n`);
      } catch (err) {
        appendLog(`\n[ERR] ${String(err)}\n`);
      }
      showMainMenu();
    },
  );
};

// ── Boot ──────────────────────────────────────────────────────────────────────

showMainMenu();
