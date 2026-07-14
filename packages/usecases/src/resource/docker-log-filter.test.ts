import { describe, expect, test } from "bun:test";
import { filterDockerLogs, getDockerLogLevel } from "./docker-log-filter";

describe("Docker log filters", () => {
  test("classifies the dashboard log levels", () => {
    expect(getDockerLogLevel("[error] database failed")).toBe("error");
    expect(getDockerLogLevel("warning: deprecated option")).toBe("warning");
    expect(getDockerLogLevel("[ok] ready")).toBe("success");
    expect(getDockerLogLevel("[debug] config loaded")).toBe("debug");
  });

  test("filters text and level on the server without changing matching lines", () => {
    const logs = [
      "2026-01-01T00:00:00Z [info] booting",
      "2026-01-01T00:00:01Z [error] database failed",
      "2026-01-01T00:00:02Z [ok] ready",
    ].join("\n");

    expect(
      filterDockerLogs(logs, { search: "database", levels: ["error"] }),
    ).toBe("2026-01-01T00:00:01Z [error] database failed");
  });
});
