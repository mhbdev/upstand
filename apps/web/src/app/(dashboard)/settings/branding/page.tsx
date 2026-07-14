"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

type BrandingState = {
  appName: string;
  appDescription: string;
  logoUrl: string;
  faviconUrl: string;
  loginLogoUrl: string;
  supportUrl: string;
  docsUrl: string;
  metaTitle: string;
  footerText: string;
  customCss: string;
};

const emptyBranding: BrandingState = {
  appName: "",
  appDescription: "",
  logoUrl: "",
  faviconUrl: "",
  loginLogoUrl: "",
  supportUrl: "",
  docsUrl: "",
  metaTitle: "",
  footerText: "",
  customCss: "",
};

export default function BrandingPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const [branding, setBranding] = useState(emptyBranding);
  const query = useQuery({ ...trpc.webServer.getSettings.queryOptions() });
  const update = useMutation({
    ...trpc.webServer.updateBranding.mutationOptions(),
    onSuccess: () => toast.success("Branding settings saved"),
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    const settings = query.data?.settings;
    if (!settings) return;
    setBranding({
      appName: settings.appName ?? "",
      appDescription: settings.appDescription ?? "",
      logoUrl: settings.logoUrl ?? "",
      faviconUrl: settings.faviconUrl ?? "",
      loginLogoUrl: settings.loginLogoUrl ?? "",
      supportUrl: settings.supportUrl ?? "",
      docsUrl: settings.docsUrl ?? "",
      metaTitle: settings.metaTitle ?? "",
      footerText: settings.footerText ?? "",
      customCss: settings.customCss ?? "",
    });
  }, [query.data]);

  const setField = (field: keyof BrandingState, value: string) =>
    setBranding((current) => ({ ...current, [field]: value }));

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Branding"
        description="Customize the self-hosted dashboard identity and public links."
      />
      <Card>
        <CardHeader>
          <CardTitle>White-label settings</CardTitle>
          <CardDescription>
            Branding is organization-authorized and never changes deployment
            credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["appName", "Application name"],
              ["appDescription", "Application description"],
              ["logoUrl", "Logo URL"],
              ["faviconUrl", "Favicon URL"],
              ["loginLogoUrl", "Login logo URL"],
              ["supportUrl", "Support URL"],
              ["docsUrl", "Documentation URL"],
              ["metaTitle", "Browser title"],
              ["footerText", "Footer text"],
            ] as Array<[keyof BrandingState, string]>
          ).map(([field, label]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`branding-${field}`}>{label}</Label>
              <Input
                id={`branding-${field}`}
                value={branding[field]}
                onChange={(event) => setField(field, event.target.value)}
              />
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="branding-custom-css">Custom CSS</Label>
            <textarea
              id="branding-custom-css"
              className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs"
              value={branding.customCss}
              onChange={(event) => setField("customCss", event.target.value)}
              placeholder="/* Optional presentation overrides */"
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!organization?.id || update.isPending}
                onClick={() =>
                  organization?.id &&
                  update.mutate({
                    organizationId: organization.id,
                    ...Object.fromEntries(
                      Object.entries(branding).map(([key, value]) => [
                        key,
                        value.trim() || null,
                      ]),
                    ),
                  } as Parameters<typeof update.mutate>[0])
                }
              >
                {update.isPending ? "Saving…" : "Save branding"}
              </Button>
              <Button
                variant="outline"
                disabled={!organization?.id || update.isPending}
                onClick={() => {
                  if (!organization?.id) return;
                  update.mutate(
                    {
                      organizationId: organization.id,
                      appName: null,
                      appDescription: null,
                      logoUrl: null,
                      faviconUrl: null,
                      loginLogoUrl: null,
                      supportUrl: null,
                      docsUrl: null,
                      metaTitle: null,
                      footerText: null,
                      customCss: null,
                    },
                    { onSuccess: () => setBranding(emptyBranding) },
                  );
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
