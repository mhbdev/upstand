"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { Switch } from "@upstand/ui/components/switch";
import { GlobeIcon } from "@/components/huge-icons";

export type CertificateProvider =
  | "letsencrypt"
  | "zerossl"
  | "self-signed"
  | "none";

interface ServerDomainCardProps {
  serverDomain: string;
  setServerDomain: (domain: string) => void;
  email: string;
  setEmail: (email: string) => void;
  httpsEnabled: boolean;
  setHttpsEnabled: (enabled: boolean) => void;
  certificateProvider: CertificateProvider;
  setCertificateProvider: (provider: CertificateProvider) => void;
  onSave: (e: React.FormEvent) => void;
  isSaving: boolean;
}

export function ServerDomainCard({
  serverDomain,
  setServerDomain,
  email,
  setEmail,
  httpsEnabled,
  setHttpsEnabled,
  certificateProvider,
  setCertificateProvider,
  onSave,
  isSaving,
}: ServerDomainCardProps) {
  return (
    <form onSubmit={onSave}>
      <Card className="border border-border/40 bg-card/20 shadow-sm transition-all duration-200 hover:border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2.5 font-semibold text-lg tracking-tight">
            <GlobeIcon className="size-5 text-primary" />
            <span>Server Domain</span>
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs">
            Add a domain to your server application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 border-border/10 border-t pt-5">
          {/* Row 1: Domain & Let's Encrypt Email */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="server-domain-input"
                className="font-medium text-xs"
              >
                Domain
              </Label>
              <Input
                id="server-domain-input"
                type="text"
                value={serverDomain}
                onChange={(e) => setServerDomain(e.target.value)}
                placeholder="e.g. dokploy.circulo-ai.com"
                className="h-10 border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground/50 focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="server-email-input"
                className="font-medium text-xs"
              >
                Let's Encrypt Email
              </Label>
              <Input
                id="server-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. 1839491@gmail.com"
                className="h-10 border-border/50 bg-background/50 text-sm placeholder:text-muted-foreground/50 focus:border-primary"
              />
            </div>
          </div>

          {/* Row 2: HTTPS Switch Row */}
          <div className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/10 p-4 transition-colors hover:bg-muted/20">
            <div className="space-y-1">
              <Label
                htmlFor="https-toggle"
                className="cursor-pointer font-semibold text-foreground text-xs"
              >
                HTTPS
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Automatically provision SSL Certificate.
              </p>
            </div>
            <Switch
              id="https-toggle"
              checked={httpsEnabled}
              onCheckedChange={setHttpsEnabled}
            />
          </div>

          {/* Row 3: Certificate Provider Select */}
          <div className="space-y-2">
            <Label
              htmlFor="cert-provider-select"
              className="font-medium text-xs"
            >
              Certificate Provider
            </Label>
            <Select
              value={certificateProvider}
              onValueChange={(val) =>
                setCertificateProvider(val as CertificateProvider)
              }
            >
              <SelectTrigger
                id="cert-provider-select"
                className="h-10 border-border/50 bg-background/50 text-sm"
              >
                <SelectValue placeholder="Select Certificate Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
                <SelectItem value="zerossl">ZeroSSL</SelectItem>
                <SelectItem value="self-signed">Self-Signed</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Row 4: Save Action Footer */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="h-9 min-w-24 px-5 font-semibold text-xs shadow-sm transition-all"
            >
              {isSaving ? (
                <>
                  <Spinner className="mr-2 size-3.5" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
