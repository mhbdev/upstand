import { createHash, createHmac } from "node:crypto";
import type {
  SecretProviderConfiguration,
  SecretProviderType,
} from "@upstand/domain";
import type { ExternalSecretProviderPort } from "@upstand/usecases";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectToValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export class SecretProviderRegistry implements ExternalSecretProviderPort {
  async read(
    provider: SecretProviderType,
    configuration: SecretProviderConfiguration,
  ): Promise<Record<string, string>> {
    if (provider === "vault") return this.readVault(configuration);
    if (provider === "onepassword") return this.readOnePassword(configuration);
    return this.readAws(configuration);
  }

  private async readVault(
    config: SecretProviderConfiguration,
  ): Promise<Record<string, string>> {
    const address = stringValue(config.address)?.replace(/\/$/, "");
    const path = stringValue(config.path);
    const token = stringValue(config.token);
    if (!address || !path || !token)
      throw new Error("Vault requires address, path, and token");
    const response = await fetch(`${address}/v1/${path}`, {
      headers: { "X-Vault-Token": token, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Vault returned HTTP ${response.status}`);
    const body = (await response.json()) as { data?: { data?: unknown } };
    return objectToValues(body.data?.data ?? body.data);
  }

  private async readOnePassword(
    config: SecretProviderConfiguration,
  ): Promise<Record<string, string>> {
    const host = stringValue(config.connectHost)?.replace(/\/$/, "");
    const token = stringValue(config.connectToken);
    const vaultId = stringValue(config.vaultId);
    const itemId = stringValue(config.itemId);
    if (!host || !token || !vaultId || !itemId)
      throw new Error(
        "1Password Connect requires connectHost, connectToken, vaultId, and itemId",
      );
    const response = await fetch(
      `${host}/v1/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok)
      throw new Error(`1Password Connect returned HTTP ${response.status}`);
    const body = (await response.json()) as {
      fields?: Array<{ label?: string; value?: unknown }>;
    };
    return Object.fromEntries(
      (body.fields ?? [])
        .filter((field) => field.label && typeof field.value === "string")
        .map((field) => [field.label as string, field.value as string]),
    );
  }

  private async readAws(
    config: SecretProviderConfiguration,
  ): Promise<Record<string, string>> {
    const region = stringValue(config.region);
    const accessKeyId = stringValue(config.accessKeyId);
    const secretAccessKey = stringValue(config.secretAccessKey);
    const secretId = stringValue(config.path);
    if (!region || !accessKeyId || !secretAccessKey || !secretId)
      throw new Error(
        "AWS Secrets Manager requires region, accessKeyId, secretAccessKey, and path",
      );
    const service = "secretsmanager";
    const host = `${service}.${region}.amazonaws.com`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const target = "secretsmanager.GetSecretValue";
    const body = JSON.stringify({ SecretId: secretId });
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
    const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signingKey = createHmac("sha256", `AWS4${secretAccessKey}`)
      .update(dateStamp)
      .digest();
    const regionKey = createHmac("sha256", signingKey).update(region).digest();
    const serviceKey = createHmac("sha256", regionKey).update(service).digest();
    const finalKey = createHmac("sha256", serviceKey)
      .update("aws4_request")
      .digest();
    const signature = createHmac("sha256", finalKey)
      .update(stringToSign)
      .digest("hex");
    const response = await fetch(`https://${host}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        Host: host,
        "X-Amz-Date": amzDate,
        "X-Amz-Target": target,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    });
    if (!response.ok)
      throw new Error(`AWS Secrets Manager returned HTTP ${response.status}`);
    const result = (await response.json()) as { SecretString?: string };
    if (!result.SecretString)
      throw new Error("AWS secret has no SecretString payload");
    try {
      return objectToValues(JSON.parse(result.SecretString));
    } catch {
      return { SECRET: result.SecretString };
    }
  }
}
