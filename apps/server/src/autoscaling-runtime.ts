import { AutoscalingService } from "@upstand/usecases";
import {
  CaddyServiceToken,
  DockerServiceToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";
import { getServiceProvider } from "./di";

export class AutoscalingRuntime {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly lastScaledAt = new Map<string, number>();

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const scope = getServiceProvider().createScope();
    try {
      const decisions = await new AutoscalingService(
        scope.resolve(UnitOfWorkToken),
        scope.resolve(DockerServiceToken),
        this.lastScaledAt,
        scope.resolve(CaddyServiceToken),
      ).reconcileAll();
      for (const decision of decisions)
        log.info({
          message: "Autoscaling changed resource replicas",
          ...decision,
        });
    } catch (error) {
      log.warn({
        message: "Autoscaling reconciliation failed",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
      await scope.dispose();
    }
  }

  start(): void {
    this.timer = setInterval(() => void this.runOnce(), 30_000);
    this.timer.unref?.();
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
