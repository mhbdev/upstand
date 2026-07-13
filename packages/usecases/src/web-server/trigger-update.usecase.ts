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
    if (!/^v?\d+\.\d+\.\d+(?:[-+].*)?$/.test(version) && version !== "canary") {
      throw new Error(
        "Updates must target a published semantic release or canary channel",
      );
    }
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

          if (currentImage.includes(":source-")) {
            throw new Error(
              "This installation was built from source. Run the GitHub installer to update it, or reinstall from a published release image.",
            );
          }

          let baseImage = currentImage;
          if (baseImage.includes("@sha256:")) {
            baseImage = baseImage.split("@sha256:")[0];
          }
          const digestSeparator = baseImage.lastIndexOf("@");
          if (digestSeparator >= 0)
            baseImage = baseImage.slice(0, digestSeparator);
          const tagSeparator = baseImage.lastIndexOf(":");
          if (tagSeparator > baseImage.lastIndexOf("/")) {
            baseImage = baseImage.slice(0, tagSeparator);
          }

          const newImage = `${baseImage}:${version}`;
          const currentEnv = (inspect.Spec.TaskTemplate.ContainerSpec.Env ??
            []) as string[];
          const nextEnv = currentEnv.some((entry) =>
            entry.startsWith("UPSTAND_VERSION="),
          )
            ? currentEnv.map((entry) =>
                entry.startsWith("UPSTAND_VERSION=")
                  ? `UPSTAND_VERSION=${version}`
                  : entry,
              )
            : [...currentEnv, `UPSTAND_VERSION=${version}`];
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
                Env: nextEnv,
              },
              ForceUpdate: (inspect.Spec.TaskTemplate.ForceUpdate || 0) + 1,
            },
            UpdateConfig: inspect.Spec.UpdateConfig,
            RollbackConfig: inspect.Spec.RollbackConfig,
            Networks: inspect.Spec.Networks,
            EndpointSpec: inspect.Spec.EndpointSpec,
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
          idempotencyKey: `platform-restart:${version}`,
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
