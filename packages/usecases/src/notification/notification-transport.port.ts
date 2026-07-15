import type { NotificationConfiguration } from "@upstand/domain";

/**
 * Outbound notification port owned by the application layer.
 *
 * Provider-specific HTTP and SMTP behaviour belongs to infrastructure. Use
 * cases depend on this contract so they can be exercised without a network.
 */
export interface NotificationMessage {
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationTransport {
  send(
    configuration: NotificationConfiguration,
    message: NotificationMessage,
  ): Promise<void>;
}
