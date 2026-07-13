export interface Schedule {
  id: string;
  resourceId: string | null;
  name: string;
  cronExpression: string;
  command: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateScheduleDTO = Omit<
  Schedule,
  "id" | "createdAt" | "updatedAt"
>;
