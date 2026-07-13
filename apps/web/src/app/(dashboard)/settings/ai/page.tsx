"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { type AIProvider, isAIProvider } from "@upstand/domain";
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
import { Bot, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export function UpGalSettingsPanel() {
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
  const listModels = useMutation({
    ...trpc.ai.listModels.mutationOptions(),
    onSuccess: (models) => {
      setModels(models);
      toast.success(`Loaded ${models.length} ${providerLabel} models`);
    },
    onError: (error) => toast.error(error.message),
  });
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [model, setModel] = useState("gpt-5.4-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<
    Array<{ id: string; name: string; contextLength?: number }>
  >([]);
  const autoLoadedCatalog = useRef("");

  useEffect(() => {
    if (!settings.data) return;
    if (isAIProvider(settings.data.provider))
      setProvider(settings.data.provider);
    setModel(settings.data.model);
    setBaseUrl(settings.data.baseUrl || "");
  }, [settings.data]);

  useEffect(() => {
    if (!organizationId || !settings.data?.configured) return;
    const key = `${organizationId}:${provider}`;
    if (autoLoadedCatalog.current === key) return;
    autoLoadedCatalog.current = key;
    listModels.mutate({ organizationId, provider });
  }, [organizationId, provider, settings.data?.configured]);

  const providerLabel =
    provider === "openrouter"
      ? "OpenRouter"
      : provider === "gateway"
        ? "Gateway"
        : provider[0].toUpperCase() + provider.slice(1);

  function loadModels() {
    if (!organizationId) return;
    listModels.mutate({
      organizationId,
      provider,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
    });
  }

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
    <div className="mx-auto max-w-4xl space-y-6 p-1">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-2xl">
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
            <Select
              value={provider}
              onValueChange={(value) => {
                if (value && isAIProvider(value)) {
                  setProvider(value);
                  setModels([]);
                }
              }}
            >
              <SelectTrigger id="provider" className="w-full">
                <SelectValue placeholder="Select an AI provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="gateway">
                  OpenAI-compatible / Gateway
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={
                provider === "openrouter"
                  ? "provider/model (or custom)"
                  : "gpt-5.4-mini"
              }
              list="ai-models"
            />
            <datalist id="ai-models">
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </datalist>
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                Load the current provider catalog or enter any custom model ID.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadModels}
                disabled={listModels.isPending}
              >
                {listModels.isPending ? "Loading…" : "Load models"}
              </Button>
            </div>
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
            <Button
              variant="outline"
              onClick={() =>
                testProvider.mutate({
                  organizationId,
                  provider,
                  model,
                  baseUrl: baseUrl || undefined,
                  apiKey: apiKey || undefined,
                })
              }
              disabled={!organizationId || testProvider.isPending}
            >
              {testProvider.isPending ? "Testing…" : "Test connection"}
            </Button>
            {settings.data ? (
              <>
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
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <ShieldCheck className="size-4" />
        All UpGal mutations require an explicit approval in chat.
      </div>
      {settings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
    </div>
  );
}

export default function AiSettingsPage() {
  return (
    <main className="h-full overflow-y-auto p-6">
      <UpGalSettingsPanel />
    </main>
  );
}
