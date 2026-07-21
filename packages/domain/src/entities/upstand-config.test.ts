import { describe, expect, it } from "bun:test";
import { parseUpstandConfig } from "./upstand-config";

describe("parseUpstandConfig", () => {
  it("should parse standard HTTP cron configuration", () => {
    const json = JSON.stringify({
      crons: [
        {
          path: "/api/cron",
          schedule: "0 10 * * *",
        },
      ],
    });

    const result = parseUpstandConfig(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crons).toHaveLength(1);
      expect(result.data.crons?.[0]).toEqual({
        path: "/api/cron",
        schedule: "0 10 * * *",
        method: "GET",
        shellType: "bash",
        timezone: "UTC",
      });
    }
  });

  it("should parse Dokploy style script/command schedule", () => {
    const json = JSON.stringify({
      crons: [
        {
          name: "Database Backup",
          command: "npm run backup",
          schedule: "0 0 * * *",
          timezone: "America/New_York",
          shellType: "sh",
          serviceName: "db",
        },
      ],
    });

    const result = parseUpstandConfig(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crons).toHaveLength(1);
      expect(result.data.crons?.[0]).toEqual({
        name: "Database Backup",
        command: "npm run backup",
        schedule: "0 0 * * *",
        timezone: "America/New_York",
        shellType: "sh",
        serviceName: "db",
        method: "GET",
      });
    }
  });

  it("should return empty crons array for empty json object", () => {
    const result = parseUpstandConfig("{}");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crons).toBeUndefined();
    }
  });

  it("should return failure for invalid json syntax", () => {
    const result = parseUpstandConfig("invalid json");
    expect(result.success).toBe(false);
  });
});
