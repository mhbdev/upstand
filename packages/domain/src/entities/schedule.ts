import { z } from "zod";

export interface Schedule {
  id: string;
  resourceId: string | null;
  name: string;
  cronExpression: string;
  jobType: "command" | "deployment" | "backup";
  backupScheduleId: string | null;
  command: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateScheduleDTO = Omit<Schedule, "createdAt" | "updatedAt"> & {
  id?: string;
};

const ScheduleNameSchema = z.string().trim().min(1).max(120);
const ScheduleCronSchema = z.string().trim().min(1).max(120);
export const ScheduleCommandSchema = z.string().trim().min(1).max(1024);
export const ScheduleJobTypeSchema = z.enum([
  "command",
  "deployment",
  "backup",
]);

export const GetSchedulesInputSchema = z.object({
  resourceId: z.string().min(1),
});

export type GetSchedulesInput = z.infer<typeof GetSchedulesInputSchema>;

export const CreateScheduleInputSchema = z
  .object({
    resourceId: z.string().min(1),
    name: ScheduleNameSchema,
    cronExpression: ScheduleCronSchema,
    jobType: ScheduleJobTypeSchema.default("command"),
    backupScheduleId: z.string().min(1).optional().nullable(),
    command: z.string().trim().max(1024).default(""),
    enabled: z.boolean().default(true),
  })
  .superRefine((input, ctx) => {
    if (
      input.jobType === "command" &&
      !ScheduleCommandSchema.safeParse(input.command).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["command"],
        message: "A command is required for command schedules",
      });
    }
    if (input.jobType === "backup" && !input.backupScheduleId) {
      ctx.addIssue({
        code: "custom",
        path: ["backupScheduleId"],
        message: "Choose a backup schedule",
      });
    }
  });

export type CreateScheduleInput = z.infer<typeof CreateScheduleInputSchema>;

export const UpdateScheduleInputSchema = z.object({
  id: z.string().min(1),
  name: ScheduleNameSchema.optional(),
  cronExpression: ScheduleCronSchema.optional(),
  jobType: ScheduleJobTypeSchema.optional(),
  backupScheduleId: z.string().min(1).nullable().optional(),
  command: ScheduleCommandSchema.optional(),
  enabled: z.boolean().optional(),
});

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;

export const DeleteScheduleInputSchema = z.object({
  id: z.string().min(1),
});

export type DeleteScheduleInput = z.infer<typeof DeleteScheduleInputSchema>;
