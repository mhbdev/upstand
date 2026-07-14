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
        certificateType: "letsencrypt",
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

  test("uses the Swarm stack service name for Compose routes", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "compose-1",
        name: "Storefront",
        type: "compose",
        appName: "storefront",
        domains: JSON.stringify([
          { host: "shop.example.com", port: 3000, serviceName: "web" },
        ]),
      },
    ]);

    expect(caddyfile).toContain("reverse_proxy storefront_web:3000");
  });

  test("uses the Compose service DNS name for standalone Compose routes", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "compose-2",
        name: "Storefront",
        type: "compose",
        composeType: "compose",
        appName: "storefront",
        domains: JSON.stringify([
          { host: "shop.example.com", port: 3000, serviceName: "web" },
        ]),
      },
    ]);

    expect(caddyfile).toContain("reverse_proxy web:3000");
    expect(caddyfile).not.toContain("reverse_proxy storefront_web:3000");
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

  test("emits an internal certificate policy for private HTTPS routes", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "resource-1",
        name: "Private app",
        type: "application",
        appName: "private-app",
        domains: JSON.stringify([
          {
            host: "private.example.com",
            port: 3000,
            certificateType: "internal",
          },
        ]),
      },
    ]);

    expect(caddyfile).toContain("private.example.com {");
    expect(caddyfile).toContain("tls internal");
  });

  test("provisions and references a selected custom certificate", () => {
    const caddyfile = generateCaddyfileContent(
      {},
      [
        {
          id: "resource-custom-cert",
          name: "Custom TLS app",
          type: "application",
          appName: "custom-tls-app",
          domains: JSON.stringify([
            {
              host: "secure.example.com",
              port: 3000,
              https: true,
              certificateType: "custom",
              certificateId: "cert-1",
            },
          ]),
        },
      ],
      [
        {
          id: "cert-1",
          certificatePem: "CERTIFICATE",
          privateKeyPem: "PRIVATE KEY",
        },
      ],
    );

    expect(caddyfile).toContain(
      "tls /etc/caddy/certificates/cert-1.crt /etc/caddy/certificates/cert-1.key",
    );
  });

  test("rejects a custom route whose certificate is not available", () => {
    expect(() =>
      generateCaddyfileContent({}, [
        {
          id: "resource-custom-cert",
          name: "Custom TLS app",
          type: "application",
          appName: "custom-tls-app",
          domains: JSON.stringify([
            {
              host: "secure.example.com",
              port: 3000,
              https: true,
              certificateType: "custom",
              certificateId: "missing",
            },
          ]),
        },
      ]),
    ).toThrow("was not found");
  });

  test("emits validated redirects and security headers for a route", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "resource-redirect",
        name: "redirect",
        type: "application",
        appName: "redirect",
        composeType: null,
        domains: JSON.stringify([
          {
            host: "legacy.example.com",
            path: "/old",
            port: 80,
            https: true,
            certificateType: "letsencrypt",
            middlewares: [],
            redirectTo: "https://example.com{uri}",
            redirectStatus: "308",
            securityHeaders: {
              hsts: true,
              nosniff: true,
              frameDeny: true,
              referrerPolicy: "strict-origin",
            },
          },
        ]),
      },
    ]);

    expect(caddyfile).toContain('redir "https://example.com{uri}" 308');
    expect(caddyfile).toContain("Strict-Transport-Security");
    expect(caddyfile).toContain('X-Frame-Options "DENY"');
  });

  test("emits forward-auth middleware with only validated header names", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "resource-auth",
        name: "protected",
        type: "application",
        appName: "protected",
        domains: JSON.stringify([
          {
            host: "protected.example.com",
            forwardAuth: {
              address: "https://auth.example.com",
              uri: "/verify",
              copyHeaders: ["X-User", "X-Email"],
            },
          },
        ]),
      },
    ]);

    expect(caddyfile).toContain('forward_auth "https://auth.example.com" {');
    expect(caddyfile).toContain('uri "/verify"');
    expect(caddyfile).toContain("copy_headers X-User");
    expect(caddyfile).toContain("copy_headers X-Email");
  });

  test("renders typed managed middlewares before resource routes", () => {
    const caddyfile = generateCaddyfileContent(
      {
        caddyMiddlewares: JSON.stringify([
          { name: "security-headers", body: "header -Server" },
          { name: "compression", body: "encode zstd gzip" },
        ]),
      },
      [
        {
          id: "resource-managed-middleware",
          name: "managed middleware",
          type: "application",
          appName: "managed-middleware",
          domains: JSON.stringify([
            {
              host: "managed.example.com",
              middlewares: ["security-headers", "compression"],
            },
          ]),
        },
      ],
    );

    expect(caddyfile).toContain("(security-headers) {");
    expect(caddyfile).toContain("(compression) {");
    expect(caddyfile).toContain("import security-headers");
    expect(caddyfile).toContain("import compression");
    expect(caddyfile.indexOf("(security-headers) {")).toBeLessThan(
      caddyfile.indexOf("managed.example.com {"),
    );
  });

  test("emits hashed basic authentication without accepting plaintext", () => {
    const caddyfile = generateCaddyfileContent({}, [
      {
        id: "resource-basic-auth",
        name: "basic protected",
        type: "application",
        appName: "basic-protected",
        domains: JSON.stringify([
          {
            host: "basic.example.com",
            basicAuth: {
              username: "admin",
              passwordHash:
                "$2a$14$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu",
            },
          },
        ]),
      },
    ]);

    expect(caddyfile).toContain("basic_auth {");
    expect(caddyfile).toContain(
      "admin $2a$14$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu",
    );
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

  test("enables structured access logs only when requested", () => {
    const disabled = generateCaddyfileContent({}, [
      {
        id: "resource-logs",
        name: "Logged app",
        type: "application",
        appName: "logged-app",
        domains: JSON.stringify([{ host: "logs.example.com", port: 3000 }]),
      },
    ]);
    const enabled = generateCaddyfileContent({ accessLogsEnabled: true }, [
      {
        id: "resource-logs",
        name: "Logged app",
        type: "application",
        appName: "logged-app",
        domains: JSON.stringify([{ host: "logs.example.com", port: 3000 }]),
      },
    ]);

    expect(disabled).not.toContain("output file /var/log/caddy/access.log");
    expect(enabled).toContain("format json");
    expect(enabled).toContain("output file /var/log/caddy/access.log");
  });
});
