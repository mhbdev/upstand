"use client";

import { useMutation } from "@tanstack/react-query";
import type { AIProvider } from "@upstand/domain";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import { Card } from "@upstand/ui/components/card";
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/dashboard/confirm-action-dialog";
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

export function ProviderCard({
  organizationId,
  provider,
  onEdit,
  onDeleted,
}: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    <>
      <Card className="flex flex-col justify-between p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-base">{provider.name}</h3>
            <Badge variant={provider.enabled ? "default" : "secondary"}>
              {provider.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <div className="space-y-1 font-mono text-muted-foreground text-xs">
            <p>Provider: {provider.provider}</p>
            <p>Model: {provider.model}</p>
            {provider.baseUrl ? (
              <p className="truncate">Base URL: {provider.baseUrl}</p>
            ) : null}
            <p>
              Temperature:{" "}
              {provider.temperature !== null ? provider.temperature : "Default"}
            </p>
            <p>
              Reasoning: {provider.reasoningEnabled ? "Enabled" : "Disabled"}
            </p>
            <p>
              Max Output Tokens:{" "}
              {provider.maxOutputTokens !== null
                ? provider.maxOutputTokens
                : "Default"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
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
            Test Connection
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
            onClick={() => setDeleteDialogOpen(true)}
            disabled={test.isPending || remove.isPending}
          >
            {remove.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2 data-icon="inline-start" />
            )}
            Delete
          </Button>
        </div>
      </Card>

      <ConfirmActionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete AI Provider?"
        description={`Are you sure you want to delete "${provider.name}"? Any operations assigned to this provider will lose their configuration.`}
        actionLabel="Delete Provider"
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate({ organizationId, id: provider.id });
        }}
      />
    </>
  );
}
