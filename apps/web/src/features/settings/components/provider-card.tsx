"use client";

import { useMutation } from "@tanstack/react-query";
import type { AIProvider } from "@upstand/domain";
import { Badge } from "@upstand/ui/components/badge";
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
    <Card className="border border-border/40 bg-card/25 shadow-sm">
      <CardContent className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <p className="font-semibold text-foreground text-sm">
              {provider.name}
            </p>
            <Badge variant="secondary">
              {PROVIDER_NAMES[provider.provider]}
            </Badge>
            {provider.baseUrl ? (
              <Badge variant="outline">Custom URL</Badge>
            ) : null}
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="mt-0.5 truncate font-medium text-foreground/90">
                <code>{provider.model}</code>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Temperature</dt>
              <dd className="mt-0.5 font-medium text-foreground/90">
                {provider.temperature ?? "default"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reasoning</dt>
              <dd className="mt-0.5 font-medium text-foreground/90">
                {provider.reasoningEnabled ? "On" : "Off"}
              </dd>
            </div>
            {provider.maxOutputTokens ? (
              <div>
                <dt className="text-muted-foreground">Max output</dt>
                <dd className="mt-0.5 font-medium text-foreground/90">
                  {provider.maxOutputTokens}
                </dd>
              </div>
            ) : null}
            {provider.baseUrl ? (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-muted-foreground">Endpoint</dt>
                <dd
                  className="mt-0.5 truncate font-medium text-foreground/90"
                  title={provider.baseUrl}
                >
                  {provider.baseUrl}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
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
            aria-label={`Delete ${provider.name}`}
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
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
