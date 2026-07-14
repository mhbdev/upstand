import { describe, expect, test } from "bun:test";
import { getDatabaseEnvironment } from "./database-environment";

describe("database runtime environment", () => {
  test("derives libSQL basic authentication without exposing plaintext", () => {
    const environment = getDatabaseEnvironment({
      dbType: "libsql",
      credentials: JSON.stringify({
        dbUser: "admin",
        dbPassword: "secret",
      }),
      envVars: "{}",
    } as never);

    expect(environment.SQLD_HTTP_AUTH).toBe(
      `basic:${Buffer.from("admin:secret").toString("base64")}`,
    );
    expect(JSON.stringify(environment)).not.toContain("secret");
  });
});
