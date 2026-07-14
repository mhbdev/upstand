import { resolve4 } from "node:dns/promises";
import { z } from "zod";

export const ValidateDomainInputSchema = z.object({
  organizationId: z.string().min(1),
  host: z.string().trim().min(1).max(253),
  expectedIp: z
    .string()
    .trim()
    .regex(
      /^(?:\d{1,3}\.){3}\d{1,3}$/,
      "Expected origin must be an IPv4 address",
    )
    .optional(),
});

export type ValidateDomainInput = z.infer<typeof ValidateDomainInputSchema>;

type CidrProvider = { name: string; ranges: string[]; warning: string };

const CDN_PROVIDERS: CidrProvider[] = [
  {
    name: "Cloudflare",
    ranges: [
      "173.245.48.0/20",
      "103.21.244.0/22",
      "103.22.200.0/22",
      "103.31.4.0/22",
      "141.101.64.0/18",
      "108.162.192.0/18",
      "190.93.240.0/20",
      "188.114.96.0/20",
      "198.41.128.0/17",
      "162.158.0.0/15",
      "104.16.0.0/13",
      "104.24.0.0/14",
      "172.64.0.0/13",
    ],
    warning: "DNS resolves to Cloudflare; validate the origin separately.",
  },
  {
    name: "Fastly",
    ranges: [
      "23.235.32.0/20",
      "43.249.72.0/22",
      "103.244.50.0/24",
      "104.156.80.0/20",
      "146.75.0.0/17",
      "151.101.0.0/16",
      "199.232.0.0/16",
    ],
    warning: "DNS resolves to Fastly; validate the origin separately.",
  },
];

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  if (!network || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const toInt = (value: string) =>
    value
      .split(".")
      .reduce((result, octet) => (result << 8) + Number(octet), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (toInt(ip) & mask) === (toInt(network) & mask);
}

function normalizeHost(value: string): string {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  const host = new URL(withProtocol).hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes("..")) {
    throw new Error("A valid domain hostname is required");
  }
  return host;
}

export class ValidateDomainUseCase {
  async execute(input: ValidateDomainInput) {
    const host = normalizeHost(input.host);
    try {
      const ips = await resolve4(host);
      const provider = ips
        .flatMap((ip) =>
          CDN_PROVIDERS.filter((candidate) =>
            candidate.ranges.some((range) => ipv4InCidr(ip, range)),
          ),
        )
        .at(0);
      if (provider) {
        return {
          host,
          isValid: true,
          resolvedIps: ips,
          cdnProvider: provider.name,
          warning: provider.warning,
        };
      }
      const matchesExpected = input.expectedIp
        ? ips.includes(input.expectedIp)
        : true;
      return {
        host,
        isValid: matchesExpected,
        resolvedIps: ips,
        cdnProvider: null,
        warning: matchesExpected
          ? null
          : `Domain resolves to ${ips.join(", ")} instead of ${input.expectedIp}.`,
      };
    } catch (error) {
      return {
        host,
        isValid: false,
        resolvedIps: [],
        cdnProvider: null,
        warning:
          error instanceof Error ? error.message : "DNS resolution failed",
      };
    }
  }
}
