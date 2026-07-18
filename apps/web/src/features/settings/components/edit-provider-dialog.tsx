"use client";

import { useMutation } from "@tanstack/react-query";
import type { AIProvider } from "@upstand/domain";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "@/components/huge-icons";
import { trpc } from "@/utils/trpc";
import type { ProviderView } from "./provider-card";
import {
  ProviderFormFields,
  type ProviderFormValues,
} from "./provider-form-fields";

type Props = {
  organizationId: string;
  provider: ProviderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

export function EditProviderDialog({
  organizationId,
  provider,
  open,
  onOpenChange,
  onUpdated,
}: Props) {
  const [values, setValues] = useState<ProviderFormValues>({
    name: "",
    provider: "openai",
    model: "",
    apiKey: "",
    baseUrl: "",
  });
  const [modelSuggestions, setModelSuggestions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Sync form when the provider being edited changes
  useEffect(() => {
    if (!provider) return;
    setValues({
      name: provider.name,
      provider: provider.provider,
      model: provider.model,
      apiKey: "",
      baseUrl: provider.baseUrl ?? "",
    });
    setModelSuggestions([]);
  }, [provider]);

  const update = useMutation({
    ...trpc.ai.updateProvider.mutationOptions(),
    onSuccess: () => {
      toast.success("Provider updated");
      onOpenChange(false);
      onUpdated();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update provider");
    },
  });

  const test = useMutation({
    ...trpc.ai.testProvider.mutationOptions(),
    onSuccess: (data) => toast.success(`Connection works · ${data.model}`),
    onError: (err) => toast.error(err.message || "Connection test failed"),
  });

  const listModels = useMutation({
    ...trpc.ai.listModels.mutationOptions(),
    onSuccess: (models) => setModelSuggestions(models),
    onError: () => {
      // Model catalog is an enhancement; failure is non-blocking
    },
  });

  function handleChange(next: Partial<ProviderFormValues>) {
    setValues((prev) => {
      const updated = { ...prev, ...next };
      if (next.provider && next.provider !== prev.provider) {
        listModels.mutate({
          organizationId,
          provider: next.provider as AIProvider,
          apiKey: updated.apiKey || undefined,
          baseUrl: updated.baseUrl || undefined,
        });
      }
      return updated;
    });
  }

  function handleSave() {
    if (!provider) return;
    if (!values.name.trim()) {
      toast.error("Please enter a name for this provider.");
      return;
    }
    update.mutate({
      organizationId,
      id: provider.id,
      name: values.name.trim(),
      provider: values.provider,
      model: values.model,
      apiKey: values.apiKey || undefined,
      baseUrl: values.baseUrl || undefined,
    });
  }

  function handleTest() {
    if (!provider) return;
    test.mutate({
      organizationId,
      id: provider.id,
      provider: values.provider,
      model: values.model,
      apiKey: values.apiKey || undefined,
      baseUrl: values.baseUrl || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit provider</DialogTitle>
          <DialogDescription>
            Update this provider&apos;s settings. Leave the API key blank to
            keep the currently saved key.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <ProviderFormFields
            values={values}
            onChange={handleChange}
            hasExistingKey={provider?.configured ?? false}
            modelSuggestions={modelSuggestions}
            idPrefix="edit-provider"
          />
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={test.isPending || update.isPending}
          >
            {test.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
