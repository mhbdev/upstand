"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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
  NativeSelect,
  NativeSelectOption,
} from "@upstand/ui/components/native-select";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function AiSettingsPage() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || "";
  const settings = useQuery({
    ...trpc.ai.settings.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const save = useMutation({
    ...trpc.ai.saveSettings.mutationOptions(),
    onSuccess: () => {
      toast.success("AI settings saved");
      void settings.refetch();
    },
  });
  const remove = useMutation({
    ...trpc.ai.removeSettings.mutationOptions(),
    onSuccess: () => {
      toast.success("AI provider removed");
      void settings.refetch();
    },
  });
  const testProvider = useMutation({
    ...trpc.ai.testSettings.mutationOptions(),
    onSuccess: () => toast.success("Provider connection works"),
  });
  const keys = useQuery({
    ...trpc.ai.apiKeys.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const createKey = useMutation({
    ...trpc.ai.createApiKey.mutationOptions(),
    onSuccess: (result) => {
      setCreatedKey(result.secret);
      void keys.refetch();
    },
  });
  const revokeKey = useMutation({
    ...trpc.ai.revokeApiKey.mutationOptions(),
    onSuccess: () => void keys.refetch(),
  });
  const [provider, setProvider] = useState<
    "openai" | "anthropic" | "google" | "gateway"
  >("openai");
  const [model, setModel] = useState("gpt-5.4-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string>();

  useEffect(() => {
    if (!settings.data) return;
    setProvider(settings.data.provider as typeof provider);
    setModel(settings.data.model);
    setBaseUrl(settings.data.baseUrl || "");
  }, [settings.data]);

  function saveSettings() {
    if (!organizationId) return;
    save.mutate({
      organizationId,
      provider,
      model,
      baseUrl,
      apiKey: apiKey || undefined,
    });
    setApiKey("");
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bot className="size-6" />
          UpGal AI
        </h1>
        <p className="mt-1 text-muted-foreground">
          Configure the model that powers your organization’s operations
          assistant.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>
            API keys are encrypted server-side and never sent back to the
            browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <NativeSelect
              id="provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as typeof provider)
              }
            >
              <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
              <NativeSelectOption value="anthropic">
                Anthropic
              </NativeSelectOption>
              <NativeSelectOption value="google">Google</NativeSelectOption>
              <NativeSelectOption value="gateway">
                OpenAI-compatible / Gateway
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-5.4-mini"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="api-key">
              API key{" "}
              {settings.data?.configured ? "(leave blank to keep current)" : ""}
            </Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-…"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="base-url">Custom base URL (optional)</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              onClick={saveSettings}
              disabled={!organizationId || save.isPending}
            >
              <Save className="mr-2 size-4" />
              {save.isPending ? "Saving…" : "Save provider"}
            </Button>
            {settings.data ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => testProvider.mutate({ organizationId })}
                  disabled={testProvider.isPending}
                >
                  {testProvider.isPending ? "Testing…" : "Test connection"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => remove.mutate({ organizationId })}
                  disabled={remove.isPending}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove provider
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            External MCP keys
          </CardTitle>
          <CardDescription>
            Create narrowly scoped keys for Claude, Cursor, or other MCP
            clients. The secret is shown only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Key name, e.g. Cursor"
            />
            <Button
              disabled={!keyName || createKey.isPending}
              onClick={() =>
                createKey.mutate({
                  organizationId,
                  name: keyName,
                  scopes: ["*"],
                })
              }
            >
              Create key
            </Button>
          </div>
          {createdKey ? (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">
                Copy this secret now; it cannot be recovered.
              </p>
              <code className="mt-2 block break-all">{createdKey}</code>
            </div>
          ) : null}
          <div className="divide-y rounded-md border">
            {keys.data
              ?.filter((key) => !key.revokedAt)
              .map((key) => (
                <div key={key.id} className="flex items-center gap-3 p-3">
                  <div className="mr-auto">
                    <p className="font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {key.prefix} · {key.scopes.join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      revokeKey.mutate({ organizationId, id: key.id })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            {!keys.data?.some((key) => !key.revokedAt) ? (
              <p className="p-4 text-sm text-muted-foreground">
                No external keys yet.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4" />
        All UpGal mutations require an explicit approval in chat.
      </div>
      {settings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
    </main>
  );
}
