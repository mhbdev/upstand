import { describe, expect, test } from "bun:test";
import { parseDomainMappings } from "@upstand/domain";
import { generateCaddyfileContent } from "./caddy.service";

describe("Caddy domain configuration", () => {
  test("normalizes legacy mappings and creates an Automatic HTTPS site", () => {
    const mappings = parseDomainMappings(
      JSON.stringify([{ host: "APP.Example.com.", port: 3000 }]),
    );

    expect(mappings).toEqual([
      {
        host: "app.example.com",
        path: "/",
        internalPath: "/",
        stripPath: false,
        port: 3000,
        serviceName: undefined,
        https: true,
        middlewares: [],
      },
    ]);

    const caddyfile = generateCaddyfileContent(
      {
        letsEncryptEmail: "ops@example.com",
        caddySnippets: "(security-headers) {\n\theader -Server\n}",
      },
      [
        {
          id: "resource-1",
          name: "Application",
          type: "application",
          appName: "application",
          domains: JSON.stringify(mappings),
        },
      ],
    );

    expect(caddyfile).toContain("email ops@example.com");
    expect(caddyfile).toContain("(security-headers) {");
    expect(caddyfile).toContain("app.example.com {");
    expect(caddyfile).toContain("reverse_proxy application:3000");
    expect(caddyfile).not.toContain("http://app.example.com");
  });

  test("preserves route order and compiles rewrites, Caddy snippets, and path stripping", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "resource-1",
        name: "API",
        type: "application",
        appName: "api",
        domains: JSON.stringify([
          {
            host: "example.com",
            path: "/api",
            internalPath: "/v1",
            port: 3000,
            serviceName: "api-service",
            https: true,
            middlewares: ["security-headers", "auth"],
          },
          {
            host: "example.com",
            path: "/assets",
            internalPath: "/",
            stripPath: true,
            port: 8080,
            serviceName: "asset-service",
            https: true,
            middlewares: [],
          },
        ]),
      },
    ]);

    expect(caddyfile).toContain("uri replace /api /v1");
    expect(caddyfile).toContain("import security-headers");
    expect(caddyfile).toContain("import auth");
    expect(caddyfile).toContain("reverse_proxy api-service:3000");
    expect(caddyfile).toContain("uri strip_prefix /assets");
    expect(caddyfile).toContain("reverse_proxy asset-service:8080");
    expect(caddyfile).toContain('respond "Not found" 404');
    expect(caddyfile.indexOf("/assets")).toBeLessThan(
      caddyfile.indexOf("/api"),
    );
  });

  test("rejects unsafe mappings and conflicting ownership", () => {
    expect(() =>
      parseDomainMappings(JSON.stringify([{ host: "https://example.com" }])),
    ).toThrow("valid public hostname");
    expect(() =>
      parseDomainMappings(
        JSON.stringify([{ host: "example.com", path: "/admin*" }]),
      ),
    ).toThrow("Paths must start with /");

    expect(() =>
      generateCaddyfileContent({}, [
        {
          id: "resource-1",
          name: "First",
          type: "application",
          appName: "first",
          domains: JSON.stringify([{ host: "example.com", path: "/" }]),
        },
        {
          id: "resource-2",
          name: "Second",
          type: "application",
          appName: "second",
          domains: JSON.stringify([{ host: "example.com", path: "/" }]),
        },
      ]),
    ).toThrow("already assigned");
  });

  test("requires an explicit service for compose resources", () => {
    expect(() =>
      generateCaddyfileContent({}, [
        {
          id: "compose-1",
          name: "Storefront",
          type: "compose",
          appName: "storefront",
          domains: JSON.stringify([{ host: "shop.example.com", port: 3000 }]),
        },
      ]),
    ).toThrow("needs an explicit service name");
  });

  test("does not mix HTTP-only and HTTPS routes on one hostname", () => {
    expect(() =>
      generateCaddyfileContent({}, [
        {
          id: "resource-1",
          name: "Secure API",
          type: "application",
          appName: "secure-api",
          domains: JSON.stringify([
            { host: "example.com", path: "/api", https: true },
          ]),
        },
        {
          id: "resource-2",
          name: "Legacy HTTP",
          type: "application",
          appName: "legacy-http",
          domains: JSON.stringify([
            { host: "example.com", path: "/legacy", https: false },
          ]),
        },
      ]),
    ).toThrow("same HTTPS setting");
  });

  test("does not allow custom configuration to expose Caddy's admin API", () => {
    expect(() =>
      generateCaddyfileContent({ globalCaddyfile: "admin :2019" }),
    ).toThrow("managed by Upstand");
  });

  test("keeps HTTP and HTTPS listeners distinct", () => {
    expect(() =>
      generateCaddyfileContent({ httpPort: 8443, httpsPort: 8443 }),
    ).toThrow("must be different");
  });
});
