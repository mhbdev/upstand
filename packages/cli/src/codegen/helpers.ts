import type { FieldDef, ZodTypeName } from "../types";

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toKebab(s: string): string {
  return s
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

export function zodExpr(zodType: ZodTypeName, optional: boolean): string {
  let base = "";
  if (zodType === "uuid") {
    base = "z.uuid()";
  } else if (zodType === "date") {
    base = "z.date()";
  } else if (zodType === "email") {
    base = "z.email()";
  } else if (zodType === "json") {
    base = "z.any()";
  } else {
    base = `z.${zodType}()`;
  }
  return optional ? `${base}.optional()` : base;
}

export function tsType(zodType: ZodTypeName): string {
  const map: Record<ZodTypeName, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    date: "Date",
    uuid: "string",
    json: "any",
    email: "string",
  };
  return map[zodType];
}

export function buildSchemaBody(fields: FieldDef[]): string {
  const base = [
    "  id: z.uuid()",
    "  createdAt: z.date()",
    "  updatedAt: z.date()",
  ];
  const custom = fields.map(
    (f) => `  ${f.name}: ${zodExpr(f.zodType, f.optional)}`,
  );
  return [...base, ...custom].join(",\n");
}

export function buildDtoBody(fields: FieldDef[]): string {
  if (fields.length === 0) return "  id?: string;";
  return fields
    .map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${tsType(f.zodType)};`)
    .join("\n");
}

export function buildInputSchemaBody(fields: FieldDef[]): string {
  const required = fields.filter((f) => !f.optional);
  if (required.length === 0) return "  // TODO: add input fields";
  return required
    .map((f) => `  ${f.name}: ${zodExpr(f.zodType, false)}`)
    .join(",\n");
}

export function drizzleColumn(field: FieldDef): string {
  let colType = "";
  if (field.zodType === "string") {
    colType = `text("${field.name}")`;
  } else if (field.zodType === "number") {
    colType = `integer("${field.name}")`;
  } else if (field.zodType === "boolean") {
    colType = `boolean("${field.name}")`;
  } else if (field.zodType === "date") {
    colType = `timestamp("${field.name}")`;
  } else if (field.zodType === "uuid") {
    colType = `text("${field.name}")`;
  } else if (field.zodType === "email") {
    colType = `text("${field.name}")`;
  } else if (field.zodType === "json") {
    colType = `jsonb("${field.name}")`;
  } else {
    colType = `text("${field.name}")`;
  }

  return `  ${field.name}: ${colType}${field.optional ? "" : ".notNull()"}`;
}

export function buildDrizzleSchemaBody(fields: FieldDef[]): string {
  const base = [
    `  id: text("id").primaryKey()`,
    `  createdAt: timestamp("created_at").defaultNow().notNull()`,
    `  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull()`,
  ];
  const custom = fields.map(drizzleColumn);
  return [...base, ...custom].join(",\n");
}

export function getDrizzleImports(fields: FieldDef[]): string[] {
  const imports = new Set(["pgTable", "text", "timestamp"]);
  for (const f of fields) {
    if (f.zodType === "number") imports.add("integer");
    if (f.zodType === "boolean") imports.add("boolean");
    if (f.zodType === "json") imports.add("jsonb");
  }
  return [...imports].sort();
}
