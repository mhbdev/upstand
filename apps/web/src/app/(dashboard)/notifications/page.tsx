"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  NotificationChannelView,
  NotificationEventType,
  NotificationProviderType,
} from "@upstand/domain";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@upstand/ui/components/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { Switch } from "@upstand/ui/components/switch";
import { Textarea } from "@upstand/ui/components/textarea";
import {
  Bell,
  CircleDot,
  Link2,
  Mail,
  MessageCircle,
  MessageSquare,
  Radio,
  Send,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

type NotificationChannelDto = Omit<
  NotificationChannelView,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

type ConfigurationField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "email" | "number" | "password" | "text" | "textarea";
  required?: boolean;
  sensitive?: boolean;
  description?: string;
  defaultValue?: string;
};

type ProviderDefinition = {
  label: string;
  icon: LucideIcon;
  fields: ConfigurationField[];
};

const PROVIDERS: Record<NotificationProviderType, ProviderDefinition> = {
  slack: {
    label: "Slack",
    icon: MessageCircle,
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        required: true,
      },
      {
        key: "channel",
        label: "Channel override",
        placeholder: "#deployments",
      },
    ],
  },
  telegram: {
    label: "Telegram",
    icon: Send,
    fields: [
      {
        key: "botToken",
        label: "Bot token",
        type: "password",
        required: true,
        sensitive: true,
      },
      { key: "chatId", label: "Chat ID", required: true },
      {
        key: "messageThreadId",
        label: "Message thread ID",
        placeholder: "Optional forum topic",
      },
    ],
  },
  discord: {
    label: "Discord",
    icon: MessageSquare,
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://discord.com/api/webhooks/...",
        required: true,
      },
    ],
  },
  lark: {
    label: "Lark",
    icon: CircleDot,
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://open.larksuite.com/open-apis/bot/v2/hook/...",
        required: true,
      },
    ],
  },
  teams: {
    label: "Microsoft Teams",
    icon: Users,
    fields: [
      {
        key: "webhookUrl",
        label: "Workflow webhook URL",
        placeholder: "https://...webhook.office.com/...",
        required: true,
      },
    ],
  },
  email: {
    label: "SMTP Email",
    icon: Mail,
    fields: [
      {
        key: "smtpHost",
        label: "SMTP host",
        placeholder: "smtp.example.com",
        required: true,
      },
      {
        key: "smtpPort",
        label: "SMTP port",
        type: "number",
        defaultValue: "587",
        required: true,
      },
      { key: "username", label: "Username", required: true },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        sensitive: true,
      },
      {
        key: "fromAddress",
        label: "From address",
        type: "email",
        placeholder: "alerts@example.com",
        required: true,
      },
      {
        key: "toAddresses",
        label: "Recipients",
        type: "text",
        placeholder: "oncall@example.com, team@example.com",
        required: true,
      },
      {
        key: "secure",
        label: "Use TLS immediately",
        description: "Usually enabled only for SMTP port 465.",
      },
    ],
  },
  resend: {
    label: "Resend",
    icon: Send,
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        sensitive: true,
      },
      {
        key: "fromAddress",
        label: "From address",
        type: "email",
        placeholder: "alerts@example.com",
        required: true,
      },
      {
        key: "toAddresses",
        label: "Recipients",
        placeholder: "oncall@example.com, team@example.com",
        required: true,
      },
    ],
  },
  gotify: {
    label: "Gotify",
    icon: Bell,
    fields: [
      {
        key: "serverUrl",
        label: "Server URL",
        placeholder: "https://gotify.example.com",
        required: true,
      },
      {
        key: "appToken",
        label: "Application token",
        type: "password",
        required: true,
        sensitive: true,
      },
      {
        key: "priority",
        label: "Priority",
        type: "number",
        defaultValue: "5",
        required: true,
      },
    ],
  },
  ntfy: {
    label: "ntfy",
    icon: Radio,
    fields: [
      {
        key: "serverUrl",
        label: "Server URL",
        placeholder: "https://ntfy.sh",
        required: true,
      },
      {
        key: "topic",
        label: "Topic",
        placeholder: "upstand-alerts",
        required: true,
      },
      {
        key: "accessToken",
        label: "Access token",
        type: "password",
        sensitive: true,
      },
      {
        key: "priority",
        label: "Priority",
        type: "number",
        defaultValue: "3",
        required: true,
      },
    ],
  },
  mattermost: {
    label: "Mattermost",
    icon: CircleDot,
    fields: [
      { key: "webhookUrl", label: "Incoming webhook URL", required: true },
      { key: "channel", label: "Channel override", placeholder: "deployments" },
      { key: "username", label: "Display name", placeholder: "Upstand" },
    ],
  },
  pushover: {
    label: "Pushover",
    icon: Bell,
    fields: [
      {
        key: "userKey",
        label: "User key",
        type: "password",
        required: true,
        sensitive: true,
      },
      {
        key: "apiToken",
        label: "Application API token",
        type: "password",
        required: true,
        sensitive: true,
      },
      {
        key: "priority",
        label: "Priority (-2 to 2)",
        type: "number",
        defaultValue: "0",
        required: true,
      },
      {
        key: "retry",
        label: "Emergency retry seconds",
        type: "number",
        description: "Required when priority is 2.",
      },
      {
        key: "expire",
        label: "Emergency expire seconds",
        type: "number",
        description: "Required when priority is 2.",
      },
    ],
  },
  custom: {
    label: "Custom webhook",
    icon: Link2,
    fields: [
      {
        key: "endpoint",
        label: "Endpoint URL",
        placeholder: "https://example.com/hooks/upstand",
        required: true,
      },
      {
        key: "headers",
        label: "JSON headers",
        type: "textarea",
        placeholder: '{"Authorization":"Bearer …"}',
        description: "Optional HTTP headers included with every JSON webhook.",
      },
    ],
  },
};

const EVENT_OPTIONS: Array<{
  value: NotificationEventType;
  label: string;
  description: string;
}> = [
  {
    value: "deployment_succeeded",
    label: "App deploy",
    description: "When a resource deployment succeeds.",
  },
  {
    value: "deployment_failed",
    label: "App build error",
    description: "When a resource deployment fails.",
  },
  {
    value: "database_backup_completed",
    label: "Database backup",
    description: "When a database backup completes.",
  },
  {
    value: "volume_backup_completed",
    label: "Volume backup",
    description: "When a volume backup completes.",
  },
  {
    value: "docker_cleanup_completed",
    label: "Docker cleanup",
    description: "When scheduled Docker cleanup completes.",
  },
  {
    value: "platform_restart",
    label: "Upstand restart",
    description: "When a platform update starts a restart.",
  },
  {
    value: "cluster_initialized",
    label: "Cluster initialized",
    description: "When Docker Swarm is initialized.",
  },
  {
    value: "cluster_node_updated",
    label: "Cluster node updated",
    description: "When a node role or availability changes.",
  },
  {
    value: "cluster_node_removed",
    label: "Cluster node removed",
    description: "When a node is drained and removed.",
  },
  {
    value: "cluster_token_rotated",
    label: "Cluster token rotated",
    description: "When a worker or manager join token is rotated.",
  },
];

function providerValues(
  provider: NotificationProviderType,
  summary?: Record<string, unknown> | null,
): Record<string, string> {
  const values = Object.fromEntries(
    PROVIDERS[provider].fields.map((field) => [
      field.key,
      field.defaultValue ?? "",
    ]),
  );
  for (const [key, value] of Object.entries(summary ?? {})) {
    values[key] = Array.isArray(value)
      ? value.join(", ")
      : key === "headers"
        ? JSON.stringify(value)
        : String(value);
  }
  return values;
}

function ProviderForm({
  provider,
  values,
  onChange,
  editing,
}: {
  provider: NotificationProviderType;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  editing: boolean;
}) {
  return (
    <FieldGroup>
      {PROVIDERS[provider].fields.map((field) => {
        if (field.key === "secure") {
          const checked = values.secure === "true";
          return (
            <Field key={field.key} orientation="horizontal">
              <FieldContent>
                <FieldTitle>{field.label}</FieldTitle>
                {field.description && (
                  <FieldDescription>{field.description}</FieldDescription>
                )}
              </FieldContent>
              <Switch
                checked={checked}
                onCheckedChange={(next) => onChange(field.key, String(next))}
              />
            </Field>
          );
        }

        const placeholder =
          field.sensitive && editing
            ? "Leave blank to keep the saved value"
            : field.placeholder;
        return (
          <Field key={field.key}>
            <FieldLabel htmlFor={`notification-${field.key}`}>
              {field.label}
            </FieldLabel>
            {field.type === "textarea" ? (
              <Textarea
                id={`notification-${field.key}`}
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={placeholder}
              />
            ) : (
              <Input
                id={`notification-${field.key}`}
                type={field.type ?? "text"}
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={placeholder}
                required={field.required && !(editing && field.sensitive)}
              />
            )}
            {field.description && (
              <FieldDescription>{field.description}</FieldDescription>
            )}
          </Field>
        );
      })}
    </FieldGroup>
  );
}

export default function NotificationsPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannelDto | null>(null);
  const [provider, setProvider] = useState<NotificationProviderType>("slack");
  const [name, setName] = useState("");
  const [events, setEvents] = useState<NotificationEventType[]>([]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    providerValues("slack"),
  );

  const { data: channels = [], refetch } = useQuery({
    ...trpc.notification.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const createChannel = useMutation({
    ...trpc.notification.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Notification channel added");
      closeDialog();
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || "Could not add notification channel"),
  });
  const updateChannel = useMutation({
    ...trpc.notification.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Notification channel updated");
      closeDialog();
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || "Could not update notification channel"),
  });
  const removeChannel = useMutation({
    ...trpc.notification.remove.mutationOptions(),
    onSuccess: () => {
      toast.success("Notification channel removed");
      refetch();
    },
    onError: (error) =>
      toast.error(error.message || "Could not remove notification channel"),
  });
  const testChannel = useMutation({
    ...trpc.notification.test.mutationOptions(),
    onSuccess: () => toast.success("Test notification delivered"),
    onError: (error) =>
      toast.error(error.message || "Test notification failed"),
  });

  const isPending = createChannel.isPending || updateChannel.isPending;

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setProvider(editing.provider);
      setName(editing.name);
      setEvents(editing.events);
      setValues(providerValues(editing.provider, editing.configurationSummary));
    }
  }, [dialogOpen, editing]);

  const providerOptions = useMemo(
    () =>
      Object.entries(PROVIDERS) as Array<
        [NotificationProviderType, ProviderDefinition]
      >,
    [],
  );

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setProvider("slack");
    setName("");
    setEvents([]);
    setValues(providerValues("slack"));
  };

  const openCreate = () => {
    setEditing(null);
    setProvider("slack");
    setName("");
    setEvents([]);
    setValues(providerValues("slack"));
    setDialogOpen(true);
  };

  const changeProvider = (next: NotificationProviderType) => {
    setProvider(next);
    setValues(providerValues(next));
  };

  const toggleEvent = (event: NotificationEventType, checked: boolean) => {
    setEvents((current) =>
      checked
        ? [...new Set([...current, event])]
        : current.filter((item) => item !== event),
    );
  };

  const buildConfiguration = () => {
    const configuration: Record<string, unknown> = { type: provider };
    for (const field of PROVIDERS[provider].fields) {
      const value = values[field.key]?.trim() ?? "";
      if (!value && (field.sensitive || !field.required)) continue;
      if (field.key === "toAddresses") {
        configuration[field.key] = value.split(/[\s,]+/).filter(Boolean);
      } else if (
        ["smtpPort", "priority", "retry", "expire"].includes(field.key)
      ) {
        configuration[field.key] = Number(value);
      } else if (field.key === "secure") {
        configuration[field.key] = values.secure === "true";
      } else if (field.key === "headers") {
        configuration[field.key] = value ? JSON.parse(value) : {};
      } else {
        configuration[field.key] = value;
      }
    }
    return configuration;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (events.length === 0) {
      toast.error("Select at least one notification action");
      return;
    }
    let configuration: Record<string, unknown>;
    try {
      configuration = buildConfiguration();
    } catch {
      toast.error("Custom headers must be a valid JSON object");
      return;
    }

    if (editing) {
      updateChannel.mutate({ id: editing.id, name, events, configuration });
      return;
    }
    createChannel.mutate({
      organizationId,
      name,
      events,
      configuration: configuration as never,
    });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl tracking-tight">
            Notifications
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Route operational alerts to multiple channels. Credentials stay
            encrypted and delivery failures never block deployments.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!organizationId}>
          Add notification
        </Button>
      </div>

      {channels.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No notification channels</EmptyTitle>
            <EmptyDescription>
              Add Slack, email, webhooks, or any supported provider to receive
              deployment and operational alerts.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreate} disabled={!organizationId}>
              Add your first channel
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <Card key={channel.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                      {(() => {
                        const ProviderIcon = PROVIDERS[channel.provider].icon;
                        return (
                          <ProviderIcon aria-hidden="true" className="size-4" />
                        );
                      })()}
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="truncate">{channel.name}</CardTitle>
                      <CardDescription>
                        {PROVIDERS[channel.provider].label}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {channel.events.length} action
                  {channel.events.length === 1 ? "" : "s"} enabled
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testChannel.mutate({ id: channel.id })}
                  disabled={testChannel.isPending}
                >
                  {testChannel.isPending && (
                    <Spinner data-icon="inline-start" />
                  )}
                  Test
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(channel);
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Remove ${channel.name}?`))
                      removeChannel.mutate({ id: channel.id });
                  }}
                  disabled={removeChannel.isPending}
                >
                  Remove
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="h-[min(92svh,860px)] w-[calc(100vw-1rem)] max-w-[min(96vw,900px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit notification" : "Add notification"}
            </DialogTitle>
            <DialogDescription>
              Select a provider, enter its connection details, then choose the
              operational events it should receive.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-7">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="notification-provider">
                  Provider
                </FieldLabel>
                <Select
                  items={providerOptions.map(([value, item]) => ({
                    value,
                    label: item.label,
                  }))}
                  value={provider}
                  onValueChange={(next) =>
                    changeProvider(next as NotificationProviderType)
                  }
                >
                  <SelectTrigger id="notification-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providerOptions.map(([value, item]) => (
                        <SelectItem key={value} value={value}>
                          <item.icon aria-hidden="true" className="size-4" />
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="notification-name">Name</FieldLabel>
                <Input
                  id="notification-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Production alerts"
                />
              </Field>
            </FieldGroup>

            <ProviderForm
              provider={provider}
              values={values}
              editing={Boolean(editing)}
              onChange={(key, value) =>
                setValues((current) => ({ ...current, [key]: value }))
              }
            />

            <FieldSet>
              <FieldLegend>Select the actions</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">
                {EVENT_OPTIONS.map((option) => (
                  <Field
                    key={option.value}
                    orientation="horizontal"
                    className="rounded-xl border p-4"
                  >
                    <FieldContent>
                      <FieldTitle>{option.label}</FieldTitle>
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                    <Switch
                      checked={events.includes(option.value)}
                      onCheckedChange={(checked) =>
                        toggleEvent(option.value, checked)
                      }
                    />
                  </Field>
                ))}
              </div>
            </FieldSet>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner data-icon="inline-start" />}
                {editing ? "Save changes" : "Create notification"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
