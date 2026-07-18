import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { GeneralScheduler } from "./general-scheduler";
import {
  CreateScheduleUseCase,
  DeleteScheduleUseCase,
  GetSchedulesUseCase,
  UpdateScheduleUseCase,
} from "./schedule.usecases";

function createUow() {
  const resources = new Map<string, any>([
    [
      "resource-1",
      { id: "resource-1", name: "Test resource", serverId: "local" },
    ],
  ]);
  const schedules = new Map<string, any>();
  const uow = {
    resourceRepository: {
      findById: async (id: string) => resources.get(id) ?? null,
    },
    scheduleRepository: {
      findById: async (id: string) => schedules.get(id) ?? null,
      findByResourceId: async (resourceId: string) =>
        [...schedules.values()].filter(
          (item) => item.resourceId === resourceId,
        ),
      findEnabled: async () =>
        [...schedules.values()].filter((item) => item.enabled),
      create: async (data: any) => {
        const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
        schedules.set(item.id, item);
        return item;
      },
      updateById: async (id: string, patch: any) => {
        const item = schedules.get(id);
        if (!item) return null;
        Object.assign(item, patch);
        return item;
      },
      deleteById: async (id: string) => schedules.delete(id),
    },
    backupScheduleRepository: {
      findById: async () => null,
    },
  } as unknown as IUnitOfWork;
  return { uow, schedules };
}

describe("resource schedules", () => {
  test("creates, lists, toggles, and deletes a validated cron schedule", async () => {
    const { uow, schedules } = createUow();
    const created = await new CreateScheduleUseCase(uow).execute({
      resourceId: "resource-1",
      name: "Nightly",
      cronExpression: "0 2 * * *",
      jobType: "command",
      command: "echo maintenance",
      enabled: true,
    });

    expect(
      await new GetSchedulesUseCase(uow).execute({ resourceId: "resource-1" }),
    ).toHaveLength(1);
    const updated = await new UpdateScheduleUseCase(uow).execute({
      id: created.id,
      enabled: false,
    });
    expect(updated.enabled).toBe(false);
    expect(
      await new DeleteScheduleUseCase(uow).execute({ id: created.id }),
    ).toBe(true);
    expect(schedules.size).toBe(0);
  });

  test("rejects malformed cron expressions", async () => {
    const { uow } = createUow();
    await expect(
      new CreateScheduleUseCase(uow).execute({
        resourceId: "resource-1",
        name: "Invalid",
        cronExpression: "not a cron",
        jobType: "command",
        command: "echo nope",
        enabled: true,
      }),
    ).rejects.toThrow("valid cron expression");
  });

  test("accepts deployment jobs without a container command", async () => {
    const { uow } = createUow();
    const schedule = await new CreateScheduleUseCase(uow).execute({
      resourceId: "resource-1",
      name: "Nightly deploy",
      cronExpression: "0 3 * * *",
      jobType: "deployment",
      command: "",
      enabled: true,
    });
    expect(schedule.jobType).toBe("deployment");
    expect(schedule.command).toBe("");
  });

  test("requires a backup schedule for backup jobs", async () => {
    const { uow } = createUow();
    await expect(
      new CreateScheduleUseCase(uow).execute({
        resourceId: "resource-1",
        name: "Nightly backup",
        cronExpression: "0 4 * * *",
        jobType: "backup",
        command: "",
        enabled: true,
      }),
    ).rejects.toThrow("Choose a backup schedule");
  });

  test("runs a disabled command schedule when explicitly requested", async () => {
    const { schedules } = createUow();
    const schedule = {
      id: "schedule-1",
      resourceId: "resource-1",
      name: "Manual maintenance",
      cronExpression: "0 4 * * *",
      jobType: "command",
      backupScheduleId: null,
      command: "echo maintenance",
      enabled: false,
    };
    schedules.set(schedule.id, schedule);
    const executed: string[] = [];
    await new GeneralScheduler({
      loadSchedules: async () => [],
      execute: async (scheduleId, manual) => {
        expect(scheduleId).toBe(schedule.id);
        expect(manual).toBe(true);
        executed.push(schedule.command);
      },
    }).executeNow(schedule.id);

    expect(executed).toEqual([schedule.command]);
  });
});
