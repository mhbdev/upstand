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
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
  ProviderFormFields,
  type ProviderFormValues,
} from "./provider-form-fields";

type Props = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

const DEFAULT_VALUES: ProviderFormValues = {
  name: "",
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "",
  temperature: 0.5,
  reasoningEnabled: false,
  maxOutputTokens: null,
};

export function AddProviderDialog({
  organizationId,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [values, setValues] = useState<ProviderFormValues>(DEFAULT_VALUES);
  const [modelSuggestions, setModelSuggestions] = useState<
    Array<{
      id: string;
      name: string;
      reasoning?: boolean;
      contextLength?: number;
    }>
  >([]);

  const add = useMutation({
    ...trpc.ai.addProvider.mutationOptions(),
    onSuccess: () => {
      toast.success("Provider added");
      setValues(DEFAULT_VALUES);
      setModelSuggestions([]);
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add provider");
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
      // Refresh model suggestions when provider changes
      if (next.provider && next.provider !== prev.provider) {
        listModels.mutate({
          organizationId,
          provider: next.provider as AIProvider,
        });
      }
      return updated;
    });
  }

  function handleSave() {
    if (!values.name.trim()) {
      toast.error("Please enter a name for this provider.");
      return;
    }
    add.mutate({
      organizationId,
      name: values.name.trim(),
      provider: values.provider,
      model: values.model,
      apiKey: values.apiKey || undefined,
      baseUrl: values.baseUrl || undefined,
      temperature: values.temperature,
      reasoningEnabled: values.reasoningEnabled,
      maxOutputTokens: values.maxOutputTokens,
    });
  }

  function handleTest() {
    test.mutate({
      organizationId,
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
          <DialogTitle>Add AI provider</DialogTitle>
          <DialogDescription>
            Configure a new AI provider. API keys are encrypted server-side and
            never sent back to the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <ProviderFormFields
            values={values}
            onChange={handleChange}
            modelSuggestions={modelSuggestions}
            idPrefix="add-provider"
          />
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={test.isPending || add.isPending}
          >
            {test.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
          <Button onClick={handleSave} disabled={add.isPending}>
            {add.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {add.isPending ? "Adding…" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
