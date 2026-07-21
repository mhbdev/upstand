import { describe, expect, it, mock } from "bun:test";
import { SyncUpstandConfigUseCase } from "./sync-upstand-config.usecase";

describe("SyncUpstandConfigUseCase", () => {
  it("should create new upstand.json schedules and remove obsolete ones without affecting manual schedules", async () => {
    const mockExistingSchedules = [
      {
        id: "sch-1",
        resourceId: "res-1",
        name: "Old Upstand Cron",
        command: "/api/old",
        cronExpression: "0 * * * *",
        timezone: "UTC",
        jobType: "cron",
        source: "upstand.json",
        enabled: true,
      },
      {
        id: "sch-manual",
        resourceId: "res-1",
        name: "User Manual Backup",
        command: "echo 'manual'",
        cronExpression: "0 0 * * *",
        timezone: "UTC",
        jobType: "command",
        source: "manual",
        enabled: true,
      },
    ];

    const created: any[] = [];
    const updated: any[] = [];
    const deletedIds: string[] = [];

    const mockResource = {
      id: "res-1",
      buildConfig: JSON.stringify({ type: "dockerfile", buildPath: "." }),
      advancedConfig: JSON.stringify({ command: [], ports: [] }),
      watchPaths: "[]",
    };
    const updatedResources: any[] = [];

    const mockUow: any = {
      resourceRepository: {
        findById: mock(async () => mockResource),
        updateById: mock(async (id: string, patch: any) => {
          updatedResources.push({ id, ...patch });
          return { ...mockResource, ...patch };
        }),
      },
      scheduleRepository: {
        findByResourceId: mock(async () => mockExistingSchedules),
        create: mock(async (data: any) => {
          created.push(data);
          return data;
        }),
        updateById: mock(async (id: any, patch: any) => {
          updated.push({ id, ...patch });
          return { id, ...patch };
        }),
        deleteById: mock(async (id: any) => {
          deletedIds.push(id);
          return true;
        }),
      },
    };
    mockUow.transaction = mock(async (cb: any) => cb(mockUow));

    const useCase = new SyncUpstandConfigUseCase(mockUow);
    const newConfigJson = JSON.stringify({
      build: {
        type: "nixpacks",
        buildPath: "./src",
        watchPaths: ["apps/web/**"],
      },
      runtime: {
        command: ["npm", "run", "start"],
        cpuLimit: 2,
        memoryLimitMb: 512,
      },
      crons: [
        {
          path: "/api/new",
          schedule: "*/5 * * * *",
        },
      ],
    });

    const result = await useCase.execute({
      resourceId: "res-1",
      configContentOrObject: newConfigJson,
    });

    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(deletedIds).toEqual(["sch-1"]);
    expect(deletedIds).not.toContain("sch-manual");
    expect(created[0].command).toBe("/api/new");
    expect(created[0].source).toBe("upstand.json");
    expect(updatedResources).toHaveLength(1);
    expect(updatedResources[0].watchPaths).toBe('["apps/web/**"]');
    expect(updatedResources[0].buildConfig).toContain('"type":"nixpacks"');
    expect(updatedResources[0].advancedConfig).toContain('"cpuLimit":2');
  });
});
