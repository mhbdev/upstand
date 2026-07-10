import { expect, test } from "bun:test";
import {
  encryptSecret,
  type IUnitOfWork,
  type NotificationChannel,
  type NotificationConfiguration,
} from "@upstand/domain";
import { UpdateNotificationChannelUseCase } from "./update-notification-channel.usecase";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

function createChannel(
  configuration: NotificationConfiguration,
): NotificationChannel {
  process.env.SSH_KEY_ENCRYPTION_KEY_V1 = TEST_KEY;
  return {
    id: "channel-1",
    organizationId: "org-1",
    name: "Production alerts",
    provider: configuration.type,
    events: ["deployment_failed"],
    encryptedConfiguration: JSON.stringify(
      encryptSecret(JSON.stringify(configuration)),
    ),
    configurationSummary: {
      chatId: "1234",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("updates notification metadata without exposing or replacing stored secrets", async () => {
  const channel = createChannel({
    type: "telegram",
    botToken: "secret-token",
    chatId: "1234",
  });
  const repository = {
    findById: async () => channel,
    updateById: async (_id: string, patch: Record<string, unknown>) => ({
      ...channel,
      ...patch,
    }),
  };
  const uow = {
    notificationChannelRepository: repository,
  } as unknown as IUnitOfWork;

  const result = await new UpdateNotificationChannelUseCase(uow).execute({
    id: channel.id,
    name: "Production deployments",
    events: ["deployment_succeeded", "deployment_failed"],
  });

  expect(result.name).toBe("Production deployments");
  expect(result.events).toEqual(["deployment_succeeded", "deployment_failed"]);
  expect("encryptedConfiguration" in result).toBe(false);
});
