"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@upstand/ui/components/alert-dialog";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { Switch } from "@upstand/ui/components/switch";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { useRequiredActiveOrganization } from "@/hooks/use-required-active-organization";
import { getServerApiUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

type Provider = {
  providerId: string;
  issuer: string;
  domain: string;
  domainVerified?: boolean;
  domainVerificationToken?: string;
  redirectURI?: string;
};

async function ssoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getServerApiUrl(`/api/auth${path}`), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.message || data.error || "SSO request failed");
  }
  return data;
}

export default function SsoSettingsPage() {
  const organizationState = useRequiredActiveOrganization();
  const organizationId = organizationState.organizationId as string;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [domain, setDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [discoveryEndpoint, setDiscoveryEndpoint] = useState("");
  const [saml, setSaml] = useState(false);
  const [entryPoint, setEntryPoint] = useState("");
  const [certificate, setCertificate] = useState("");
  const [verificationTokens, setVerificationTokens] = useState<
    Record<string, string>
  >({});
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const settings = useQuery({
    ...trpc.sso.getSettings.queryOptions({ organizationId }),
    enabled: organizationState.status === "ready",
  });
  const updateSettings = useMutation({
    ...trpc.sso.updateSettings.mutationOptions(),
    onSuccess: () => {
      void settings.refetch();
      toast.success("SSO enforcement updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshProviders = useCallback(async () => {
    if (!organizationId) return;
    try {
      const result = await ssoRequest<{ providers?: Provider[] }>(
        `/sso/providers?organizationId=${encodeURIComponent(organizationId)}`,
      );
      setProviders(result.providers || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load SSO providers",
      );
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const requestVerification = async (id: string) => {
    try {
      const result = await ssoRequest<{ domainVerificationToken: string }>(
        "/sso/request-domain-verification",
        { method: "POST", body: JSON.stringify({ providerId: id }) },
      );
      const provider = providers.find((item) => item.providerId === id);
      if (provider) {
        setVerificationTokens((current) => ({
          ...current,
          [id]: result.domainVerificationToken,
        }));
        toast.info(
          `Add TXT _upstand-sso.${provider.domain} = ${result.domainVerificationToken}`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to issue DNS challenge",
      );
    }
  };

  const register = async () => {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const body = saml
        ? {
            providerId: providerId.trim(),
            issuer: issuer.trim(),
            domain: normalizedDomain,
            organizationId,
            samlConfig: {
              entryPoint: entryPoint.trim(),
              cert: certificate.trim(),
              callbackUrl: getServerApiUrl(
                `/api/auth/sso/saml2/sp/acs/${providerId.trim()}`,
              ),
              spMetadata: {
                entityID: getServerApiUrl(
                  `/api/auth/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId.trim())}`,
                ),
              },
            },
          }
        : {
            providerId: providerId.trim(),
            issuer: issuer.trim(),
            domain: normalizedDomain,
            organizationId,
            oidcConfig: {
              clientId: clientId.trim(),
              clientSecret,
              discoveryEndpoint: discoveryEndpoint.trim() || undefined,
              pkce: true,
              scopes: ["openid", "email", "profile"],
            },
          };
      const result = await ssoRequest<
        Provider & { domainVerificationToken?: string }
      >("/sso/register", { method: "POST", body: JSON.stringify(body) });
      toast.success("SSO provider registered");
      if (result.domainVerificationToken) {
        setVerificationTokens((current) => ({
          ...current,
          [providerId.trim()]: result.domainVerificationToken as string,
        }));
        toast.info(
          `Add TXT _upstand-sso.${normalizedDomain} = ${result.domainVerificationToken}`,
        );
      }
      await refreshProviders();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to register SSO provider",
      );
    }
  };

  const verify = async (id: string) => {
    try {
      await ssoRequest("/sso/verify-domain", {
        method: "POST",
        body: JSON.stringify({ providerId: id }),
      });
      toast.success("SSO domain verified");
      await refreshProviders();
      void settings.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Domain verification failed",
      );
    }
  };

  const remove = async (id: string) => {
    try {
      await ssoRequest("/sso/delete-provider", {
        method: "POST",
        body: JSON.stringify({ providerId: id }),
      });
      toast.success("SSO provider removed");
      await refreshProviders();
      void settings.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to remove SSO provider",
      );
    }
  };

  return (
    <DashboardPage className="flex-1">
      <DashboardPageHeader
        title="Single Sign-On"
        description="Register organization-scoped OIDC or SAML providers, verify ownership, and enforce provider sign-in."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization enforcement</CardTitle>
            <CardDescription>
              Password sign-in is rejected for members after a verified provider
              is available.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="sso-enforced">
              Require SSO for this organization
            </Label>
            <Switch
              id="sso-enforced"
              checked={settings.data?.enforced === true}
              disabled={
                !organizationId ||
                settings.isPending ||
                updateSettings.isPending
              }
              onCheckedChange={(enforced) =>
                updateSettings.mutate({ organizationId, enforced })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered providers</CardTitle>
            <CardDescription>
              DNS verification is required before any provider can authenticate
              users.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {providers.map((provider) => (
              <div
                key={provider.providerId}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{provider.providerId}</div>
                    <div className="text-muted-foreground text-xs">
                      {provider.domain} · {provider.issuer}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!provider.domainVerified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => requestVerification(provider.providerId)}
                      >
                        Show DNS challenge
                      </Button>
                    )}
                    {!provider.domainVerified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verify(provider.providerId)}
                      >
                        Verify DNS
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setPendingRemove(provider.providerId)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                {!provider.domainVerified &&
                  (verificationTokens[provider.providerId] ||
                    provider.domainVerificationToken) && (
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                      TXT _upstand-sso.{provider.domain} ={" "}
                      {verificationTokens[provider.providerId] ||
                        provider.domainVerificationToken}
                    </p>
                  )}
              </div>
            ))}
            {!providers.length && (
              <p className="text-muted-foreground text-sm">
                No SSO providers registered.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Register provider</CardTitle>
            <CardDescription>
              OIDC discovery is preferred. SAML is available for providers that
              require service-provider metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Label className="flex items-center gap-2 md:col-span-2">
              <Switch checked={saml} onCheckedChange={setSaml} /> Use SAML
              instead of OIDC
            </Label>
            <div className="space-y-2">
              <Label htmlFor="provider-id">Provider ID</Label>
              <Input
                id="provider-id"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                placeholder="company-oidc"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-domain">Email domain</Label>
              <Input
                id="sso-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="issuer">Issuer</Label>
              <Input
                id="issuer"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                placeholder="https://idp.example.com"
              />
            </div>
            {saml ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="entry-point">SAML entry point</Label>
                  <Input
                    id="entry-point"
                    value={entryPoint}
                    onChange={(event) => setEntryPoint(event.target.value)}
                    placeholder="https://idp.example.com/sso"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="certificate">IdP certificate</Label>
                  <Input
                    id="certificate"
                    value={certificate}
                    onChange={(event) => setCertificate(event.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="client-id">Client ID</Label>
                  <Input
                    id="client-id"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-secret">Client secret</Label>
                  <Input
                    id="client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="discovery">
                    Discovery endpoint (optional)
                  </Label>
                  <Input
                    id="discovery"
                    value={discoveryEndpoint}
                    onChange={(event) =>
                      setDiscoveryEndpoint(event.target.value)
                    }
                    placeholder="https://idp.example.com/.well-known/openid-configuration"
                  />
                </div>
              </>
            )}
            <Button
              className="md:col-span-2"
              disabled={
                !organizationId ||
                !providerId ||
                !domain ||
                !issuer ||
                (saml
                  ? !entryPoint || !certificate
                  : !clientId || !clientSecret)
              }
              onClick={register}
            >
              Register and generate DNS challenge
            </Button>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this SSO provider?</AlertDialogTitle>
            <AlertDialogDescription>
              Members using this provider will no longer be able to start SSO
              sign-in for this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRemove) return;
                void remove(pendingRemove);
                setPendingRemove(null);
              }}
            >
              Remove provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPage>
  );
}
