"use client";

import { type AIProvider, isAIProvider } from "@upstand/domain";
import { Field, FieldLabel } from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";

export type ProviderFormValues = {
  name: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
};

type Props = {
  values: ProviderFormValues;
  onChange: (next: Partial<ProviderFormValues>) => void;
  /** When true the API key label shows a "leave blank to keep" hint */
  hasExistingKey?: boolean;
  /** Model suggestions for the autocomplete datalist */
  modelSuggestions?: Array<{ id: string; name: string }>;
  /** Prefix added to id attributes to avoid collisions when rendered multiple times */
  idPrefix?: string;
};

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  openrouter: "OpenRouter",
  gateway: "OpenAI-compatible / Gateway",
};

export function ProviderFormFields({
  values,
  onChange,
  hasExistingKey = false,
  modelSuggestions = [],
  idPrefix = "provider-form",
}: Props) {
  const datalistId = `${idPrefix}-model-list`;

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Provider name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. My GPT-4o"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-provider`}>Provider type</FieldLabel>
        <Select
          items={(
            Object.entries(PROVIDER_LABELS) as [AIProvider, string][]
          ).map(([value, label]) => ({ value, label }))}
          value={values.provider}
          onValueChange={(value) => {
            if (value && isAIProvider(value)) {
              onChange({ provider: value });
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-provider`} className="w-full">
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PROVIDER_LABELS) as [AIProvider, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-model`}>Model</FieldLabel>
        <Input
          id={`${idPrefix}-model`}
          value={values.model}
          onChange={(e) => onChange({ model: e.target.value })}
          placeholder={
            values.provider === "openrouter"
              ? "provider/model (or custom)"
              : "e.g. gpt-4o-mini"
          }
          list={datalistId}
        />
        <datalist id={datalistId}>
          {modelSuggestions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </datalist>
        <p className="text-muted-foreground text-xs">
          Models load automatically when you select a provider with a valid API
          key. You can also enter any custom model ID.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-api-key`}>
          API key{" "}
          {hasExistingKey ? (
            <span className="font-normal text-muted-foreground">
              (leave blank to keep current)
            </span>
          ) : null}
        </FieldLabel>
        <Input
          id={`${idPrefix}-api-key`}
          type="password"
          value={values.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-…"
          autoComplete="new-password"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-base-url`}>
          Custom base URL{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id={`${idPrefix}-base-url`}
          value={values.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
        />
      </Field>
    </>
  );
}
