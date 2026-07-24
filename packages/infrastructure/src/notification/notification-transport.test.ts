import { describe, expect, mock, test } from "bun:test";
import type { NotificationConfiguration } from "@upstand/domain";
import { NotificationTransportRegistry } from "./notification-transport";

describe("NotificationTransportRegistry", () => {
  const originalFetch = globalThis.fetch;

  test("formats Slack message with header, sections, and actions", async () => {
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response("ok", { status: 200, statusText: "OK" });
    }) as any;

    try {
      const registry = new NotificationTransportRegistry();
      const config: NotificationConfiguration = {
        type: "slack",
        webhookUrl: "https://hooks.slack.com/services/XXX/YYY/ZZZ",
        channel: "#deploys",
      };

      await registry.send(config, {
        title: "Deployment Succeeded",
        message: "Deployment for web API completed.",
        metadata: {
          event: "deployment_succeeded",
          resourceName: "web-api",
          projectName: "Production",
          environmentName: "Main",
          commitSha: "a1b2c3d4e5f",
          deploymentId: "dep-12345",
          dashboardUrl: "https://app.upstand.dev",
        },
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.text).toContain("🚀 Deployment Succeeded");
      expect(capturedBody.channel).toBe("#deploys");
      expect(capturedBody.blocks).toHaveLength(3);
      expect(capturedBody.blocks[0].text.text).toContain(
        "🚀 Deployment Succeeded",
      );
      expect(capturedBody.blocks[1].text.text).toContain(
        "📦 Resource: web-api",
      );
      expect(capturedBody.blocks[2].type).toBe("actions");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("formats Telegram HTML message with inline markup", async () => {
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response('{"ok":true}', { status: 200, statusText: "OK" });
    }) as any;

    try {
      const registry = new NotificationTransportRegistry();
      const config: NotificationConfiguration = {
        type: "telegram",
        botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chatId: "-100123456789",
      };

      await registry.send(config, {
        title: "Server Threshold Alert",
        message: "High CPU usage detected.",
        metadata: {
          event: "server_threshold_alert",
          serverName: "node-master-01",
          alertType: "cpu",
          value: 92,
          threshold: 85,
        },
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.chat_id).toBe("-100123456789");
      expect(capturedBody.parse_mode).toBe("HTML");
      expect(capturedBody.text).toContain("🚨 Server Threshold Alert");
      expect(capturedBody.text).toContain("📊 Metric: 92% (Threshold: 85%)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("formats Discord Embed with custom color bar", async () => {
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response("{}", { status: 204, statusText: "No Content" });
    }) as any;

    try {
      const registry = new NotificationTransportRegistry();
      const config: NotificationConfiguration = {
        type: "discord",
        webhookUrl: "https://discord.com/api/webhooks/123/abc",
      };

      await registry.send(config, {
        title: "Database Backup Completed",
        message: "PostgreSQL database backup run finished.",
        metadata: {
          event: "database_backup_completed",
          resourceName: "postgres-main",
          fileKey: "backups/2026-07-24/db.tar.gz",
        },
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.embeds).toHaveLength(1);
      const embed = capturedBody.embeds[0];
      expect(embed.title).toContain("💾 Database Backup Completed");
      expect(embed.color).toBe(0x22c55e); // Success green
      expect(embed.fields).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("formats Custom Webhook with rich payload", async () => {
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response("{}", { status: 200, statusText: "OK" });
    }) as any;

    try {
      const registry = new NotificationTransportRegistry();
      const config: NotificationConfiguration = {
        type: "custom",
        endpoint: "https://api.mycompany.com/webhooks/upstand",
        headers: { "X-Custom-Auth": "secret-token" },
      };

      await registry.send(config, {
        title: "Docker Cleanup Completed",
        message: "Cleaned up 12 dangling images.",
        metadata: {
          event: "docker_cleanup_completed",
          scope: "local",
        },
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.event).toBe("docker_cleanup_completed");
      expect(capturedBody.emoji).toBe("🧹");
      expect(capturedBody.formattedText).toContain(
        "Cleaned up 12 dangling images.",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
