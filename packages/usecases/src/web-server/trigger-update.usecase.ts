import { log } from "evlog";
import { z } from "zod";
import type { PublishNotificationUseCase } from "../notification/publish-notification.usecase";
import { getDockerInstance } from "../resource/docker-client";

export const TriggerUpdateInputSchema = z.object({
  version: z.string().min(1, "Version is required"),
});

export type TriggerUpdateInput = z.infer<typeof TriggerUpdateInputSchema>;

export class TriggerUpdateUseCase {
  private readonly docker = getDockerInstance();

  constructor(
    private readonly notificationPublisher?: PublishNotificationUseCase,
  ) {}

  async execute(input: TriggerUpdateInput): Promise<{ success: boolean }> {
    const version = input.version;
    log.info({ message: `Triggering self-update to version ${version}...` });

    try {
      const services = await this.docker.listServices();
      let updatedCount = 0;

      for (const s of services) {
        const name = s.Spec?.Name || "";
        if (
          name === "upstand-server" ||
          name === "upstand-web" ||
          name === "upstand-fumadocs" ||
          name.startsWith("upstand_")
        ) {
          const service = this.docker.getService(s.ID);
          const inspect = await service.inspect();
          const currentImage =
            inspect.Spec.TaskTemplate?.ContainerSpec?.Image || "";

          if (!currentImage) continue;

          let baseImage = currentImage;
          if (baseImage.includes("@sha256:")) {
            baseImage = baseImage.split("@sha256:")[0];
          }
          if (baseImage.includes(":")) {
            const parts = baseImage.split(":");
            parts.pop();
            baseImage = parts.join(":");
          }

          const newImage = `${baseImage}:${version}`;
          log.info({
            message: `Updating Swarm service '${name}' to use image '${newImage}'...`,
          });

          await service.update({
            version: inspect.Version.Index,
            Name: name,
            TaskTemplate: {
              ...inspect.Spec.TaskTemplate,
              ContainerSpec: {
                ...inspect.Spec.TaskTemplate.ContainerSpec,
                Image: newImage,
              },
            },
          });
          updatedCount++;
        }
      }

      if (updatedCount === 0) {
        log.warn({
          message:
            "No Upstand Swarm services found to update. Self-updates are supported in Docker Swarm mode.",
        });
        throw new Error(
          "No Docker Swarm services found for Upstand. Self-updates are only supported when deployed on Docker Swarm.",
        );
      }

      await this.notificationPublisher
        ?.execute({
          event: "platform_restart",
          title: "Upstand platform update started",
          message: `Upstand is applying version ${version} and will restart its services.`,
          metadata: { version, updatedServices: updatedCount },
        })
        .catch((error) => {
          log.error({
            message: "Unable to queue platform restart notification",
            err: error instanceof Error ? error.message : error,
          });
        });

      return { success: true };
    } catch (err: any) {
      log.error({
        message: `Self-update to ${version} failed`,
        err: err.message,
      });
      throw new Error(`Self-update failed: ${err.message}`);
    }
  }
}
