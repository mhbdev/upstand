import { z } from "zod";

function validateCronExpression(expr: string): boolean {
  if (!expr || typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

export const UpstandCronConfigSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    // HTTP Cron properties
    path: z
      .string()
      .trim()
      .min(1)
      .refine((val) => val.startsWith("/"), {
        message: "Cron path must start with '/'",
      })
      .optional(),
    method: z.enum(["GET", "POST"]).default("GET").optional(),
    secret: z.string().trim().optional(),

    // Command Schedule properties
    command: z.string().trim().min(1).optional(),
    shellType: z.enum(["bash", "sh"]).default("bash").optional(),
    serviceName: z.string().trim().optional(),

    // Shared schedule properties
    schedule: z
      .string()
      .trim()
      .min(1, "Schedule expression is required")
      .refine(validateCronExpression, {
        message: "Invalid cron expression",
      }),
    timezone: z.string().trim().default("UTC").optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.path && !data.command) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message:
          "Cron item must specify either a 'path' (HTTP cron) or a 'command' (Script schedule)",
      });
    }
  });

export type UpstandCronConfig = z.infer<typeof UpstandCronConfigSchema>;

export const UpstandConfigSchema = z
  .object({
    $schema: z.string().optional(),
    crons: z.array(UpstandCronConfigSchema).optional(),
  })
  .passthrough();

export type UpstandConfig = z.infer<typeof UpstandConfigSchema>;

export interface ParseUpstandConfigSuccess {
  success: true;
  data: UpstandConfig;
}

export interface ParseUpstandConfigError {
  success: false;
  error: string;
  issues: z.ZodIssue[];
}

export type ParseUpstandConfigResult =
  | ParseUpstandConfigSuccess
  | ParseUpstandConfigError;

export function parseUpstandConfig(input: unknown): ParseUpstandConfigResult {
  let objectToValidate = input;
  if (typeof input === "string") {
    try {
      objectToValidate = JSON.parse(input);
    } catch (err: any) {
      return {
        success: false,
        error: `Invalid JSON syntax: ${err.message}`,
        issues: [],
      };
    }
  }

  const result = UpstandConfigSchema.safeParse(objectToValidate);
  if (!result.success) {
    const formattedError = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      success: false,
      error: formattedError,
      issues: result.error.issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
