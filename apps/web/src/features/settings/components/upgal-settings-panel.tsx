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
import { Field, FieldLabel } from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
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
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

type UpGalSettingsPanelProps = {
  embedded?: boolean;
};

export function UpGalSettingsPanel({
  embedded = false,
}: UpGalSettingsPanelProps) {
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
    onError: () => {
      // Model catalogs are an enhancement; an unavailable catalog should not
      // interrupt editing or saving provider settings.
    },
  });
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [model, setModel] = useState("gpt-5.4-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<
    Array<{ id: string; name: string; contextLength?: number }>
  >([]);
  const [draftDirty, setDraftDirty] = useState(false);
  const providerRef = useRef(provider);

  useEffect(() => {
    if (!settings.data || draftDirty) return;
    if (isAIProvider(settings.data.provider))
      setProvider(settings.data.provider);
    setModel(settings.data.model);
    setBaseUrl(settings.data.baseUrl || "");
  }, [settings.data, draftDirty]);

  function fetchModels(nextProvider: AIProvider) {
    if (!organizationId) return;
    listModels.mutate(
      {
        organizationId,
        provider: nextProvider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      },
      {
        onSuccess: (nextModels) => {
          if (providerRef.current === nextProvider) setModels(nextModels);
        },
      },
    );
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

  const content = (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">AI provider</CardTitle>
          <CardDescription>
            Configure the model that powers UpGal. API keys are encrypted
            server-side and never sent back to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent
          className={
            embedded ? "flex flex-col gap-4" : "grid gap-5 md:grid-cols-2"
          }
        >
          <Field>
            <FieldLabel htmlFor="provider">Provider</FieldLabel>
            <Select
              value={provider}
              onValueChange={(value) => {
                if (value && isAIProvider(value)) {
                  setDraftDirty(true);
                  providerRef.current = value;
                  setProvider(value);
                  setModels([]);
                  fetchModels(value);
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
          </Field>
          <Field>
            <FieldLabel htmlFor="model">Model</FieldLabel>
            <Input
              id="model"
              value={model}
              onChange={(event) => {
                setDraftDirty(true);
                setModel(event.target.value);
              }}
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
                Provider models are loaded automatically when you switch
                providers. You can also enter any custom model ID.
              </p>
            </div>
          </Field>
          <Field className={embedded ? undefined : "md:col-span-2"}>
            <FieldLabel htmlFor="api-key">
              API key{" "}
              {settings.data?.configured ? "(leave blank to keep current)" : ""}
            </FieldLabel>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setDraftDirty(true);
                setApiKey(event.target.value);
              }}
              placeholder="sk-…"
              autoComplete="new-password"
            />
          </Field>
          <Field className={embedded ? undefined : "md:col-span-2"}>
            <FieldLabel htmlFor="base-url">
              Custom base URL (optional)
            </FieldLabel>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(event) => {
                setDraftDirty(true);
                setBaseUrl(event.target.value);
              }}
              placeholder="https://api.example.com/v1"
            />
          </Field>
          <div
            className={
              embedded
                ? "flex flex-wrap justify-end gap-2"
                : "flex flex-wrap gap-2 md:col-span-2"
            }
          >
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
              <Button
                variant="outline"
                onClick={() => remove.mutate({ organizationId })}
                disabled={remove.isPending}
              >
                <Trash2 className="mr-2 size-4" />
                Remove provider
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-start gap-2 px-1 text-muted-foreground text-xs">
        <ShieldCheck className="size-4" />
        All UpGal mutations require an explicit approval in chat.
      </div>
      {settings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
    </>
  );

  return embedded ? (
    <div className="flex flex-col gap-4">{content}</div>
  ) : (
    <DashboardPage className="max-w-4xl gap-6">
      <DashboardPageHeader
        title="UpGal AI"
        icon={<Bot className="size-6 text-primary" />}
        description="Configure the model that powers your organization’s operations assistant."
      />
      {content}
    </DashboardPage>
  );
}
