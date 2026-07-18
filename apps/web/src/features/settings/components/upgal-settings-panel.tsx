"use client";

import { useQuery } from "@tanstack/react-query";
import { getUpGalTargetDefinition } from "@upstand/api/ai/upgal-ui-targets";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { Bot, Loader2, Plus, ShieldCheck } from "@/components/huge-icons";
import { UpGalTarget } from "@/components/upgal-target";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { AddProviderDialog } from "./add-provider-dialog";
import { EditProviderDialog } from "./edit-provider-dialog";
import { FeatureAssignmentsSection } from "./feature-assignments-section";
import { ProviderCard, type ProviderView } from "./provider-card";

type UpGalSettingsPanelProps = {
  embedded?: boolean;
};

const addProviderTarget = getUpGalTargetDefinition("upgal-add-provider");

export function UpGalSettingsPanel({
  embedded = false,
}: UpGalSettingsPanelProps) {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || "";

  const providersQuery = useQuery({
    ...trpc.ai.listProviders.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderView | null>(
    null,
  );

  const providers = (providersQuery.data as ProviderView[]) || [];

  const addProviderButton = (
    <UpGalTarget definition={addProviderTarget}>
      <Button
        onClick={() => setAddOpen(true)}
        disabled={!organizationId || providersQuery.isPending}
        size="sm"
      >
        <Plus data-icon="inline-start" />
        Add provider
      </Button>
    </UpGalTarget>
  );

  const content = (
    <div
      className={
        embedded
          ? "mx-auto flex w-full max-w-5xl flex-col gap-8 p-5 sm:p-8"
          : "flex flex-col gap-8"
      }
    >
      {embedded ? (
        <section className="flex flex-col gap-4 border-border/60 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-semibold text-xl tracking-tight">
              AI Providers
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
              Configure the AI models and API integrations that power your
              organization&apos;s assistant.
            </p>
          </div>
          <div className="shrink-0">{addProviderButton}</div>
        </section>
      ) : null}

      <Card className="border border-border/40 bg-card/25 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">
            Configured providers
          </CardTitle>
          <CardDescription className="text-xs">
            Provider credentials are stored securely and used by the selected
            UpGal features.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 border-border/10 border-t pt-5">
          {providersQuery.isPending ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading providers…
            </div>
          ) : providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed px-4 py-10 text-center">
              <p className="mb-1 font-medium text-foreground/80 text-sm">
                No AI providers configured
              </p>
              <p className="mb-4 max-w-sm text-muted-foreground text-xs">
                Add an AI provider (OpenAI, Anthropic, Google, etc.) to enable
                UpGal agentic capabilities.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(true)}
                disabled={!organizationId}
              >
                <Plus className="mr-1.5 size-4" />
                Add your first provider
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {providers.map((item) => (
                <ProviderCard
                  key={item.id}
                  organizationId={organizationId}
                  provider={item}
                  onEdit={() => setEditingProvider(item)}
                  onDeleted={() => void providersQuery.refetch()}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature assignments section */}
      {!providersQuery.isPending && (
        <FeatureAssignmentsSection
          organizationId={organizationId}
          providers={providers}
        />
      )}

      <div className="flex items-start gap-2 px-1 text-muted-foreground text-xs">
        <ShieldCheck className="size-4 text-muted-foreground/80" />
        <span>
          All UpGal mutations require explicit approval in chat. Provider keys
          are encrypted server-side and never shown again.
        </span>
      </div>

      {/* Dialogs */}
      {organizationId && (
        <>
          <AddProviderDialog
            organizationId={organizationId}
            open={addOpen}
            onOpenChange={setAddOpen}
            onCreated={() => void providersQuery.refetch()}
          />
          <EditProviderDialog
            organizationId={organizationId}
            provider={editingProvider}
            open={editingProvider !== null}
            onOpenChange={(open) => {
              if (!open) setEditingProvider(null);
            }}
            onUpdated={() => void providersQuery.refetch()}
          />
        </>
      )}
    </div>
  );

  return embedded ? (
    content
  ) : (
    <DashboardPage className="max-w-5xl gap-8">
      <DashboardPageHeader
        title="UpGal AI Settings"
        icon={<Bot className="size-6 text-primary" />}
        description="Configure AI providers and assign them to specific UpGal operations."
        actions={addProviderButton}
      />
      {content}
    </DashboardPage>
  );
}
