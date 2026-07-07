export type ZodTypeName =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "uuid"
  | "json"
  | "email";

export interface FieldDef {
  name: string;
  zodType: ZodTypeName;
  optional: boolean;
}

export interface ModuleConfig {
  name: string;
  fields: FieldDef[];
  procedureAccess: "public" | "protected";
}

export interface ProcedureConfig {
  moduleName: string;
  procedureName: string;
  procedureKind: "query" | "mutation";
  procedureAccess: "public" | "protected";
  useCaseToken?: string;
  inputSchema?: string;
}

export interface LogLine {
  kind: "new" | "mod" | "del" | "ok" | "err" | "info";
  text: string;
}
