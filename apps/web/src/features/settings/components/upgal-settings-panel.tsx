"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Bot, Loader2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { AddProviderDialog } from "./add-provider-dialog";
import { EditProviderDialog } from "./edit-provider-dialog";
import { FeatureAssignmentsSection } from "./feature-assignments-section";
import { ProviderCard, type ProviderView } from "./provider-card";

type UpGalSettingsPanelProps = {
  embedded?: boolean;
};

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

  const content = (
    <div className="flex flex-col gap-6">
      {/* Providers Section */}
      <Card className="border-border bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="font-semibold text-sm">
              AI Providers
            </CardTitle>
            <CardDescription>
              Configure the AI models and API integrations that power your
              organization&apos;s assistant.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!organizationId || providersQuery.isPending}
          >
            <Plus className="mr-1.5 size-4" />
            Add provider
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        All UpGal mutations require an explicit approval in chat.
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
    <DashboardPage className="max-w-4xl gap-6">
      <DashboardPageHeader
        title="UpGal AI Settings"
        icon={<Bot className="size-6 text-primary" />}
        description="Configure AI providers and assign them to specific UpGal operations."
      />
      {content}
    </DashboardPage>
  );
}
