import { serviceProvider } from "@upstand/api/di";
import {
  GetUpdateStatusUseCaseToken,
  TriggerUpdateUseCaseToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";

export class AutoUpdateRuntime {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  start(): void {
    if (process.env.UPSTAND_AUTO_UPDATE !== "true") return;
    this.timer = setInterval(
      () => void this.checkAndApplyUpdate(),
      30 * 60_000,
    );
    this.timer.unref?.();
    setTimeout(() => void this.checkAndApplyUpdate(), 120_000).unref?.();
    log.info({ message: "Opt-in automatic release updates enabled" });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async checkAndApplyUpdate(): Promise<void> {
    if (this.inFlight || process.env.UPSTAND_SERVER_IMAGE?.includes(":source-"))
      return;
    this.inFlight = true;
    const scope = serviceProvider.createScope();
    try {
      const status = await scope.resolve(GetUpdateStatusUseCaseToken).execute();
      if (
        status.channel === "stable" &&
        status.updateAvailable &&
        status.canUpdate &&
        status.images
      ) {
        log.info({
          message: `Automatic update found ${status.latestVersion}; starting rollout`,
          currentVersion: status.currentVersion,
        });
        await scope
          .resolve(TriggerUpdateUseCaseToken)
          .execute({ version: status.latestVersion, images: status.images });
      }
    } catch (error) {
      log.error({
        message: "Automatic update check failed",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlight = false;
      await scope.dispose();
    }
  }
}
