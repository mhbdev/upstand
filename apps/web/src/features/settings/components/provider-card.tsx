"use client";

import { useMutation } from "@tanstack/react-query";
import type { AIProvider } from "@upstand/domain";
import { Button } from "@upstand/ui/components/button";
import { Card, CardContent } from "@upstand/ui/components/card";
import { toast } from "sonner";
import { Edit2, Loader2, Play, Trash2 } from "@/components/huge-icons";
import { trpc } from "@/utils/trpc";

export type ProviderView = {
  id: string;
  name: string;
  provider: AIProvider;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  configured: boolean;
  temperature: number | null;
  reasoningEnabled: boolean;
  maxOutputTokens: number | null;
};

type Props = {
  organizationId: string;
  provider: ProviderView;
  onEdit: () => void;
  onDeleted: () => void;
};

const PROVIDER_NAMES: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  gateway: "Gateway",
};

export function ProviderCard({
  organizationId,
  provider,
  onEdit,
  onDeleted,
}: Props) {
  const test = useMutation({
    ...trpc.ai.testProvider.mutationOptions(),
    onSuccess: (data) =>
      toast.success(`Connection successful using model: ${data.model}`),
    onError: (err) => toast.error(err.message || "Connection test failed"),
  });

  const remove = useMutation({
    ...trpc.ai.removeProvider.mutationOptions(),
    onSuccess: () => {
      toast.success("Provider deleted");
      onDeleted();
    },
    onError: (err) => toast.error(err.message || "Failed to delete provider"),
  });

  return (
    <Card className="overflow-hidden border-border bg-card/50 transition-all hover:bg-card">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">
              {provider.name}
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
              {PROVIDER_NAMES[provider.provider]}
            </span>
            {provider.baseUrl ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                Custom URL
              </span>
            ) : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <span>Temperature: {provider.temperature ?? "default"}</span>
              <span>Reasoning: {provider.reasoningEnabled ? "on" : "off"}</span>
              {provider.maxOutputTokens ? (
                <span>Max output: {provider.maxOutputTokens}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-muted-foreground text-xs">
            <div>
              <span className="font-medium text-foreground/75">Model: </span>
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                {provider.model}
              </code>
            </div>
            {provider.baseUrl ? (
              <div className="max-w-[300px] truncate">
                <span className="font-medium text-foreground/75">
                  Endpoint:{" "}
                </span>
                {provider.baseUrl}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => test.mutate({ organizationId, id: provider.id })}
            disabled={test.isPending || remove.isPending}
          >
            {test.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-3.5" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={test.isPending || remove.isPending}
          >
            <Edit2 className="mr-1.5 size-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (
                confirm(
                  `Are you sure you want to delete "${provider.name}"? Any operations assigned to this provider will lose their configuration.`,
                )
              ) {
                remove.mutate({ organizationId, id: provider.id });
              }
            }}
            disabled={test.isPending || remove.isPending}
          >
            {remove.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
