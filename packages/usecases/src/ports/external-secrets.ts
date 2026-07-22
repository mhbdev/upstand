import type {
  SecretProviderConfiguration,
  SecretProviderType,
} from "@upstand/domain";

export interface ExternalSecretProviderPort {
  read(
    provider: SecretProviderType,
    configuration: SecretProviderConfiguration,
  ): Promise<Record<string, string>>;
}
