import type { NotificationConfiguration } from "@upstand/domain";
import type {
  NotificationAction,
  NotificationMessage,
  NotificationTransport,
} from "@upstand/usecases/notification/notification-transport.port";
import nodemailer from "nodemailer";

const NOTIFICATION_REQUEST_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_ERROR_BODY_LENGTH = 500;

function trimTrailingSlash(value: string): string {
  let str = value.trim();
  while (str.endsWith("/")) {
    str = str.slice(0, -1);
  }
  return str;
}

async function ensureSuccess(
  response: Response,
  provider: string,
): Promise<void> {
  if (response.ok) return;
  const body = await readResponsePrefix(
    response,
    MAX_PROVIDER_ERROR_BODY_LENGTH,
  );
  throw new Error(
    `${provider} rejected the notification (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
  );
}

async function readResponsePrefix(
  response: Response,
  maxLength: number,
): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxLength);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (totalLength <= maxLength) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalLength += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(Math.min(totalLength, maxLength));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    const length = Math.min(chunk.byteLength, bytes.length - offset);
    bytes.set(chunk.subarray(0, length), offset);
    offset += length;
  }

  return new TextDecoder().decode(bytes);
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    NOTIFICATION_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] || character;
  });
}

function resolveNotificationActions(
  message: NotificationMessage,
): NotificationAction[] {
  const actions: NotificationAction[] = [];
  if (message.actions && Array.isArray(message.actions)) {
    for (const action of message.actions) {
      if (action.label && action.url) {
        actions.push({ label: action.label, url: action.url });
      }
    }
  }

  const meta = message.metadata ?? {};
  const baseUrl =
    typeof meta.dashboardUrl === "string"
      ? meta.dashboardUrl
      : typeof meta.url === "string"
        ? meta.url
        : process.env.UPSTAND_BASE_URL || process.env.APP_URL || "";

  if (
    typeof meta.actionUrl === "string" &&
    !actions.some((a) => a.url === meta.actionUrl)
  ) {
    actions.push({ label: "Open Link", url: meta.actionUrl });
  }

  if (
    meta.resourceId &&
    baseUrl &&
    !actions.some((a) => a.url.includes(`/resources/${meta.resourceId}`))
  ) {
    const cleanBase = trimTrailingSlash(baseUrl);
    actions.push({
      label: "View Resource",
      url: `${cleanBase}/resources/${meta.resourceId}`,
    });
  }

  if (
    meta.deploymentId &&
    baseUrl &&
    !actions.some((a) => a.url.includes("/deployments/"))
  ) {
    const cleanBase = trimTrailingSlash(baseUrl);
    actions.push({
      label: "View Deployment",
      url: `${cleanBase}/deployments/${meta.deploymentId}`,
    });
  }

  return actions;
}

function formatNotificationText(message: NotificationMessage): string {
  const meta = message.metadata;
  if (!meta || typeof meta !== "object") return message.message;
  const lines: string[] = [message.message];

  const metaFields: string[] = [];
  if (meta.resourceName) metaFields.push(`Resource: ${meta.resourceName}`);
  if (meta.projectName) metaFields.push(`Project: ${meta.projectName}`);
  if (meta.environmentName)
    metaFields.push(`Environment: ${meta.environmentName}`);
  if (meta.resourceType) metaFields.push(`Type: ${meta.resourceType}`);
  if (meta.commitSha)
    metaFields.push(`Commit: ${String(meta.commitSha).slice(0, 7)}`);
  if (meta.error) metaFields.push(`Error: ${meta.error}`);

  if (metaFields.length > 0) {
    lines.push("", ...metaFields.map((field) => `• ${field}`));
  }
  return lines.join("\n");
}

export class NotificationTransportRegistry implements NotificationTransport {
  async send(
    configuration: NotificationConfiguration,
    message: NotificationMessage,
  ): Promise<void> {
    switch (configuration.type) {
      case "slack":
        return this.sendSlack(configuration, message);
      case "telegram":
        return this.sendTelegram(configuration, message);
      case "discord":
        return this.sendDiscord(configuration, message);
      case "lark":
        return this.sendLark(configuration, message);
      case "teams":
        return this.sendTeams(configuration, message);
      case "email":
        return this.sendEmail(configuration, message);
      case "resend":
        return this.sendResend(configuration, message);
      case "gotify":
        return this.sendGotify(configuration, message);
      case "ntfy":
        return this.sendNtfy(configuration, message);
      case "mattermost":
        return this.sendMattermost(configuration, message);
      case "pushover":
        return this.sendPushover(configuration, message);
      case "custom":
        return this.sendCustom(configuration, message);
    }
  }

  private async sendSlack(
    configuration: Extract<NotificationConfiguration, { type: "slack" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: message.title, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: bodyText },
      },
    ];

    if (actions.length > 0) {
      blocks.push({
        type: "actions",
        elements: actions.map((action) => ({
          type: "button",
          text: { type: "plain_text", text: action.label, emoji: true },
          url: action.url,
        })),
      });
    }

    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${message.title}\n${bodyText}`,
        ...(configuration.channel ? { channel: configuration.channel } : {}),
        blocks,
      }),
    });
    await ensureSuccess(response, "Slack");
  }

  private async sendTelegram(
    configuration: Extract<NotificationConfiguration, { type: "telegram" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);

    const replyMarkup =
      actions.length > 0
        ? {
            inline_keyboard: [
              actions.map((action) => ({
                text: action.label,
                url: action.url,
              })),
            ],
          }
        : undefined;

    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${configuration.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: configuration.chatId,
          text: `<b>${escapeHtml(message.title)}</b>\n\n${escapeHtml(bodyText)}`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          ...(configuration.messageThreadId
            ? { message_thread_id: configuration.messageThreadId }
            : {}),
        }),
      },
    );
    await ensureSuccess(response, "Telegram");
  }

  private async sendDiscord(
    configuration: Extract<NotificationConfiguration, { type: "discord" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const meta = message.metadata ?? {};
    const isFailed =
      message.title.toLowerCase().includes("fail") || !!meta.error;

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
    if (meta.resourceName)
      fields.push({
        name: "Resource",
        value: String(meta.resourceName),
        inline: true,
      });
    if (meta.projectName)
      fields.push({
        name: "Project",
        value: String(meta.projectName),
        inline: true,
      });
    if (meta.environmentName)
      fields.push({
        name: "Environment",
        value: String(meta.environmentName),
        inline: true,
      });
    if (meta.error)
      fields.push({ name: "Error", value: String(meta.error), inline: false });

    const primaryUrl = actions[0]?.url;

    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: message.title,
            description: message.message,
            url: primaryUrl,
            color: isFailed ? 0xef4444 : 0x22c55e,
            ...(fields.length > 0 ? { fields } : {}),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    await ensureSuccess(response, "Discord");
  }

  private async sendLark(
    configuration: Extract<NotificationConfiguration, { type: "lark" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const bodyText = formatNotificationText(message);
    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: `${message.title}\n${bodyText}` },
      }),
    });
    await ensureSuccess(response, "Lark");
  }

  private async sendTeams(
    configuration: Extract<NotificationConfiguration, { type: "teams" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const cardActions = actions.map((action) => ({
      type: "Action.OpenUrl",
      title: action.label,
      url: action.url,
    }));

    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              type: "AdaptiveCard",
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              version: "1.4",
              body: [
                {
                  type: "TextBlock",
                  text: message.title,
                  size: "Medium",
                  weight: "Bolder",
                  wrap: true,
                },
                { type: "TextBlock", text: bodyText, wrap: true },
              ],
              ...(cardActions.length > 0 ? { actions: cardActions } : {}),
            },
          },
        ],
      }),
    });
    await ensureSuccess(response, "Microsoft Teams");
  }

  private async sendEmail(
    configuration: Extract<NotificationConfiguration, { type: "email" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const transport = nodemailer.createTransport({
      host: configuration.smtpHost,
      port: configuration.smtpPort,
      secure: configuration.secure,
      auth: { user: configuration.username, pass: configuration.password },
    });

    const actionButtonsHtml = actions
      .map(
        (a) =>
          `<a href="${escapeHtml(a.url)}" style="display:inline-block;padding:10px 16px;margin-right:8px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(a.label)}</a>`,
      )
      .join(" ");

    try {
      await transport.sendMail({
        from: configuration.fromAddress,
        to: configuration.toAddresses.join(", "),
        subject: message.title,
        text: `${bodyText}\n\n${actions.map((a) => `${a.label}: ${a.url}`).join("\n")}`,
        html: `<h2>${escapeHtml(message.title)}</h2><p>${escapeHtml(bodyText).replace(/\n/g, "<br />")}</p>${actionButtonsHtml ? `<div style="margin-top:16px;">${actionButtonsHtml}</div>` : ""}`,
      });
    } finally {
      transport.close();
    }
  }

  private async sendResend(
    configuration: Extract<NotificationConfiguration, { type: "resend" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);

    const actionButtonsHtml = actions
      .map(
        (a) =>
          `<a href="${escapeHtml(a.url)}" style="display:inline-block;padding:10px 16px;margin-right:8px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(a.label)}</a>`,
      )
      .join(" ");

    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: configuration.fromAddress,
        to: configuration.toAddresses,
        subject: message.title,
        text: `${bodyText}\n\n${actions.map((a) => `${a.label}: ${a.url}`).join("\n")}`,
        html: `<h2>${escapeHtml(message.title)}</h2><p>${escapeHtml(bodyText).replace(/\n/g, "<br />")}</p>${actionButtonsHtml ? `<div style="margin-top:16px;">${actionButtonsHtml}</div>` : ""}`,
      }),
    });
    await ensureSuccess(response, "Resend");
  }

  private async sendGotify(
    configuration: Extract<NotificationConfiguration, { type: "gotify" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const clickUrl = actions[0]?.url;

    const response = await fetchWithTimeout(
      `${trimTrailingSlash(configuration.serverUrl)}/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gotify-Key": configuration.appToken,
        },
        body: JSON.stringify({
          title: message.title,
          message: bodyText,
          priority: configuration.priority,
          ...(clickUrl
            ? {
                extras: {
                  "client::notification": { click: { url: clickUrl } },
                },
              }
            : {}),
        }),
      },
    );
    await ensureSuccess(response, "Gotify");
  }

  private async sendNtfy(
    configuration: Extract<NotificationConfiguration, { type: "ntfy" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const actionsHeader = actions
      .map((a) => `action=view, label=${a.label}, url=${a.url}`)
      .join("; ");

    const response = await fetchWithTimeout(
      `${trimTrailingSlash(configuration.serverUrl)}/${encodeURIComponent(configuration.topic)}`,
      {
        method: "POST",
        headers: {
          "X-Title": message.title,
          "X-Priority": String(configuration.priority),
          ...(actionsHeader ? { "X-Actions": actionsHeader } : {}),
          ...(configuration.accessToken
            ? { Authorization: `Bearer ${configuration.accessToken}` }
            : {}),
        },
        body: bodyText,
      },
    );
    await ensureSuccess(response, "ntfy");
  }

  private async sendMattermost(
    configuration: Extract<NotificationConfiguration, { type: "mattermost" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const actionLinksText = actions
      .map((a) => `[${a.label}](${a.url})`)
      .join(" • ");

    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `**${message.title}**\n${bodyText}${actionLinksText ? `\n\n${actionLinksText}` : ""}`,
        ...(configuration.channel
          ? { channel: `#${configuration.channel.replace(/^#/, "")}` }
          : {}),
        ...(configuration.username ? { username: configuration.username } : {}),
      }),
    });
    await ensureSuccess(response, "Mattermost");
  }

  private async sendPushover(
    configuration: Extract<NotificationConfiguration, { type: "pushover" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const bodyText = formatNotificationText(message);
    const form = new URLSearchParams({
      token: configuration.apiToken,
      user: configuration.userKey,
      title: message.title,
      message: bodyText,
      priority: String(configuration.priority),
    });
    if (actions[0]) {
      form.set("url", actions[0].url);
      form.set("url_title", actions[0].label);
    }
    if (configuration.priority === 2) {
      form.set("retry", String(configuration.retry));
      form.set("expire", String(configuration.expire));
    }

    const response = await fetchWithTimeout(
      "https://api.pushover.net/1/messages.json",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      },
    );
    await ensureSuccess(response, "Pushover");
  }

  private async sendCustom(
    configuration: Extract<NotificationConfiguration, { type: "custom" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const actions = resolveNotificationActions(message);
    const response = await fetchWithTimeout(configuration.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...configuration.headers,
      },
      body: JSON.stringify({
        title: message.title,
        message: message.message,
        actions,
        timestamp: new Date().toISOString(),
        metadata: message.metadata ?? {},
      }),
    });
    await ensureSuccess(response, "Custom webhook");
  }
}
