import type { NotificationConfiguration } from "@upstand/domain";
import type {
  NotificationMessage,
  NotificationTransport,
} from "@upstand/usecases/notification/notification-transport.port";
import nodemailer from "nodemailer";

const NOTIFICATION_REQUEST_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_ERROR_BODY_LENGTH = 500;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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
    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${message.title}\n${message.message}`,
        ...(configuration.channel ? { channel: configuration.channel } : {}),
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: message.title, emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: message.message },
          },
        ],
      }),
    });
    await ensureSuccess(response, "Slack");
  }

  private async sendTelegram(
    configuration: Extract<NotificationConfiguration, { type: "telegram" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${configuration.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: configuration.chatId,
          text: `${message.title}\n\n${message.message}`,
          disable_web_page_preview: true,
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
    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: message.title,
            description: message.message,
            color: 0x2563eb,
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
    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: `${message.title}\n${message.message}` },
      }),
    });
    await ensureSuccess(response, "Lark");
  }

  private async sendTeams(
    configuration: Extract<NotificationConfiguration, { type: "teams" }>,
    message: NotificationMessage,
  ): Promise<void> {
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
                { type: "TextBlock", text: message.message, wrap: true },
              ],
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
    const transport = nodemailer.createTransport({
      host: configuration.smtpHost,
      port: configuration.smtpPort,
      secure: configuration.secure,
      auth: { user: configuration.username, pass: configuration.password },
    });

    try {
      await transport.sendMail({
        from: configuration.fromAddress,
        to: configuration.toAddresses.join(", "),
        subject: message.title,
        text: message.message,
        html: `<h2>${escapeHtml(message.title)}</h2><p>${escapeHtml(message.message).replace(/\n/g, "<br />")}</p>`,
      });
    } finally {
      transport.close();
    }
  }

  private async sendResend(
    configuration: Extract<NotificationConfiguration, { type: "resend" }>,
    message: NotificationMessage,
  ): Promise<void> {
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
        text: message.message,
        html: `<h2>${escapeHtml(message.title)}</h2><p>${escapeHtml(message.message).replace(/\n/g, "<br />")}</p>`,
      }),
    });
    await ensureSuccess(response, "Resend");
  }

  private async sendGotify(
    configuration: Extract<NotificationConfiguration, { type: "gotify" }>,
    message: NotificationMessage,
  ): Promise<void> {
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
          message: message.message,
          priority: configuration.priority,
        }),
      },
    );
    await ensureSuccess(response, "Gotify");
  }

  private async sendNtfy(
    configuration: Extract<NotificationConfiguration, { type: "ntfy" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      `${trimTrailingSlash(configuration.serverUrl)}/${encodeURIComponent(configuration.topic)}`,
      {
        method: "POST",
        headers: {
          "X-Title": message.title,
          "X-Priority": String(configuration.priority),
          ...(configuration.accessToken
            ? { Authorization: `Bearer ${configuration.accessToken}` }
            : {}),
        },
        body: message.message,
      },
    );
    await ensureSuccess(response, "ntfy");
  }

  private async sendMattermost(
    configuration: Extract<NotificationConfiguration, { type: "mattermost" }>,
    message: NotificationMessage,
  ): Promise<void> {
    const response = await fetchWithTimeout(configuration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `**${message.title}**\n${message.message}`,
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
    const form = new URLSearchParams({
      token: configuration.apiToken,
      user: configuration.userKey,
      title: message.title,
      message: message.message,
      priority: String(configuration.priority),
    });
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
    const response = await fetchWithTimeout(configuration.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...configuration.headers,
      },
      body: JSON.stringify({
        title: message.title,
        message: message.message,
        timestamp: new Date().toISOString(),
        metadata: message.metadata ?? {},
      }),
    });
    await ensureSuccess(response, "Custom webhook");
  }
}
