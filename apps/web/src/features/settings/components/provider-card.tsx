"use client";

import { useMutation } from "@tanstack/react-query";
import type { AIProvider } from "@upstand/domain";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import { Card } from "@upstand/ui/components/card";
import { Spinner } from "@upstand/ui/components/spinner";
import { toast } from "sonner";
import { Edit2, Play, Trash2 } from "@/components/huge-icons";
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
    <Card className="p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground text-sm">
              {provider.name}
            </span>
            <Badge variant="secondary" className="text-xs">
              {PROVIDER_NAMES[provider.provider]}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {provider.model}
            </Badge>
            {provider.baseUrl ? (
              <Badge variant="outline" className="text-xs">
                Custom Endpoint
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
            <span>Temp: {provider.temperature ?? "default"}</span>
            <span>·</span>
            <span>Reasoning: {provider.reasoningEnabled ? "On" : "Off"}</span>
            {provider.maxOutputTokens ? (
              <>
                <span>·</span>
                <span>Max tokens: {provider.maxOutputTokens}</span>
              </>
            ) : null}
            {provider.baseUrl ? (
              <>
                <span>·</span>
                <span
                  className="max-w-[200px] truncate"
                  title={provider.baseUrl}
                >
                  {provider.baseUrl}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => test.mutate({ organizationId, id: provider.id })}
            disabled={test.isPending || remove.isPending}
          >
            {test.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={test.isPending || remove.isPending}
          >
            <Edit2 data-icon="inline-start" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
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
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
