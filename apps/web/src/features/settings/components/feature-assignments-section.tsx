"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { AIFeature } from "@upstand/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Field, FieldLabel } from "@upstand/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import type { ProviderView } from "./provider-card";

type Props = {
  organizationId: string;
  providers: ProviderView[];
};

type FeatureAssignmentUI = {
  key: AIFeature;
  label: string;
  description: string;
};

const FEATURES: FeatureAssignmentUI[] = [
  {
    key: "chat",
    label: "UpGal Chat Agent",
    description:
      "The provider used for interactive agent runs, terminal execution, and command suggestions.",
  },
  {
    key: "template",
    label: "Compose Template Generator",
    description:
      "The provider used when generating Docker Compose YAML structures from product requirements.",
  },
];

export function FeatureAssignmentsSection({
  organizationId,
  providers,
}: Props) {
  const assignmentsQuery = useQuery({
    ...trpc.ai.listFeatureAssignments.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const saveAssignment = useMutation({
    ...trpc.ai.saveFeatureAssignment.mutationOptions(),
    onSuccess: () => {
      toast.success("AI operation routing updated");
      void assignmentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to save assignment"),
  });

  const removeAssignment = useMutation({
    ...trpc.ai.removeFeatureAssignment.mutationOptions(),
    onSuccess: () => {
      toast.success("AI operation routing reset to fallback");
      void assignmentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to remove assignment"),
  });

  const assignments = assignmentsQuery.data || [];

  function handleValueChange(feature: AIFeature, value: string) {
    if (!value || value === "fallback") {
      removeAssignment.mutate({ organizationId, feature });
    } else {
      saveAssignment.mutate({
        organizationId,
        feature,
        providerConfigId: value,
      });
    }
  }

  const isPending =
    assignmentsQuery.isPending ||
    saveAssignment.isPending ||
    removeAssignment.isPending;

  return (
    <Card className="border-border bg-card/50">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          AI Feature Routing
        </CardTitle>
        <CardDescription>
          Link your added AI provider configurations to specific UpGal
          operations. If no provider is selected, we fall back to the first
          available provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {providers.length === 0 ? (
          <p className="text-muted-foreground text-xs italic py-2">
            Add at least one AI provider above to route features.
          </p>
        ) : (
          FEATURES.map((feat) => {
            const currentAssignment = assignments.find(
              (a) => a.feature === feat.key,
            );
            const value = currentAssignment?.providerConfigId || "fallback";

            return (
              <div
                key={feat.key}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/40 pb-5 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5 max-w-lg">
                  <span className="font-medium text-foreground text-sm">
                    {feat.label}
                  </span>
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    {feat.description}
                  </span>
                </div>
                <div className="w-full md:w-64">
                  <Field>
                    <Select
                      value={value}
                      onValueChange={(val) =>
                        handleValueChange(feat.key, val || "fallback")
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fallback">
                          None (First available fallback)
                        </SelectItem>
                        {providers.map((prov) => (
                          <SelectItem key={prov.id} value={prov.id}>
                            {prov.name} ({prov.model})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
