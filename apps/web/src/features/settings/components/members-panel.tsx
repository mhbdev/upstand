import { useForm } from "@tanstack/react-form";
import type { PermissionAction } from "@upstand/api/permissions";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Checkbox } from "@upstand/ui/components/checkbox";
import { Field, FieldError, FieldLabel } from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { useMembersSettings } from "../hooks/use-members-settings";

const MEMBER_CAPABILITIES: Array<[PermissionAction, string]> = [
  ["project:view", "View projects"],
  ["project:create", "Create projects"],
  ["project:delete", "Delete projects"],
  ["environment:view", "View environments"],
  ["environment:create", "Create environments"],
  ["environment:delete", "Delete environments"],
  ["resource:view", "View resources"],
  ["resource:create", "Create resources"],
  ["resource:update", "Update resources"],
  ["resource:delete", "Delete resources"],
  ["ssh_key:view", "View SSH keys"],
  ["ssh_key:create", "Create SSH keys"],
  ["ssh_key:delete", "Delete SSH keys"],
  ["git_provider:view", "View Git providers"],
  ["git_provider:create", "Create Git providers"],
  ["git_provider:delete", "Delete Git providers"],
  ["s3_destination:view", "View backup destinations"],
  ["s3_destination:create", "Create backup destinations"],
  ["s3_destination:delete", "Delete backup destinations"],
  ["docker_registry:view", "View registries"],
  ["docker_registry:create", "Create registries"],
  ["docker_registry:delete", "Delete registries"],
  ["server:view", "View servers"],
  ["server:create", "Create servers"],
  ["server:delete", "Delete servers"],
  ["notification:view", "View notifications"],
  ["notification:create", "Create notifications"],
  ["notification:update", "Update notifications"],
  ["notification:delete", "Delete notifications"],
];

const DEFAULT_MEMBER_CAPABILITIES: PermissionAction[] = [
  "project:view",
  "environment:view",
  "resource:view",
  "resource:update",
  "ssh_key:view",
  "git_provider:view",
  "s3_destination:view",
  "docker_registry:view",
  "server:view",
  "notification:view",
];

export function MembersPanel() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id ?? "";

  const {
    members,
    notificationChannels,
    invites,
    inviteMember,
    isInviting,
    createMember,
    isCreating,
    updateMember,
    removeMember,
    cancelInvitation,
  } = useMembersSettings(organizationId);

  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { role: "member" | "admin"; permissions: PermissionAction[] }
    >
  >({});

  const emailChannels = notificationChannels.filter(
    (channel) => channel.provider === "email" || channel.provider === "resend",
  );

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "member" as "member" | "admin",
      emailChannelId: "",
      permissions: DEFAULT_MEMBER_CAPABILITIES,
    },
    onSubmit: async ({ value }) => {
      if (mode === "create") {
        createMember({
          organizationId,
          email: value.email.trim(),
          name: value.name.trim(),
          password: value.password,
          role: value.role,
          permissions: value.permissions,
        });
      } else {
        inviteMember({
          organizationId,
          email: value.email.trim(),
          role: value.role,
          permissions: value.permissions,
          emailChannelId: value.emailChannelId,
        });
      }
    },
    validators: {
      onSubmit: ({ value }) => {
        if (!value.email.includes("@")) {
          return "Invalid email address";
        }
        if (mode === "create") {
          if (!value.name) return "Full name is required";
          if (!value.password || value.password.length < 8) {
            return "Initial password must be at least 8 characters";
          }
        } else {
          if (!value.emailChannelId) return "Email provider is required";
        }
        return undefined;
      },
    },
  });

  const handleRoleChange = (roleVal: "member" | "admin") => {
    form.setFieldValue("role", roleVal);
    form.setFieldValue(
      "permissions",
      roleVal === "admin"
        ? MEMBER_CAPABILITIES.map(([key]) => key)
        : DEFAULT_MEMBER_CAPABILITIES,
    );
  };

  if (!activeOrg) {
    return (
      <p className="text-muted-foreground text-sm">
        Select a workspace to manage members.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add workspace member</CardTitle>
          <CardDescription>
            Grant precise capabilities, create credentials immediately, or send
            an invitation through a configured Email/Resend channel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 pb-4">
            <Button
              type="button"
              size="sm"
              variant={mode === "invite" ? "default" : "outline"}
              onClick={() => {
                setMode("invite");
                form.reset();
              }}
            >
              Invitation
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "create" ? "default" : "outline"}
              onClick={() => {
                setMode("create");
                form.reset();
              }}
            >
              Create credentials
            </Button>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            {mode === "create" && (
              <form.Field
                name="name"
                validators={{
                  onChange: z.string().min(1, "Full name is required"),
                }}
              >
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Full name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Alex Johnson"
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}

            <form.Field
              name="email"
              validators={{
                onChange: z.string().email("Invalid email address"),
              }}
            >
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            {mode === "create" && (
              <form.Field
                name="password"
                validators={{
                  onChange: z
                    .string()
                    .min(8, "Initial password must be at least 8 characters"),
                }}
              >
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Initial password
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}

            <form.Field name="role">
              {(field) => (
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(val) =>
                      handleRoleChange(val as "member" | "admin")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            {mode === "invite" && (
              <form.Field
                name="emailChannelId"
                validators={{
                  onChange: z
                    .string()
                    .min(1, "Please select an Email or Resend channel"),
                }}
              >
                {(field) => (
                  <Field>
                    <FieldLabel>Email provider</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(val) => field.handleChange(val || "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Email or Resend" />
                      </SelectTrigger>
                      <SelectContent>
                        {emailChannels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            {channel.name} (
                            {channel.provider === "resend"
                              ? "Resend"
                              : "SMTP Email"}
                            )
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}

            <form.Field name="permissions">
              {(field) => (
                <Field>
                  <FieldLabel>Capabilities</FieldLabel>
                  <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
                    {MEMBER_CAPABILITIES.map(([key, label]) => (
                      <label
                        className="flex items-center gap-2 text-xs"
                        key={key}
                      >
                        <Checkbox
                          checked={field.state.value.includes(key)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...field.state.value, key]
                              : field.state.value.filter(
                                  (item) => item !== key,
                                );
                            field.handleChange(next);
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </Field>
              )}
            </form.Field>

            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
              })}
            >
              {({ canSubmit }) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || isCreating || isInviting}
                >
                  {(isCreating || isInviting) && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {mode === "invite" ? "Send invitation" : "Create member"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members and permissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {members.map((member) => {
            const draft = drafts[member.id] ?? {
              role: member.role === "admin" ? "admin" : "member",
              permissions: member.permissions ?? DEFAULT_MEMBER_CAPABILITIES,
            };
            return (
              <div
                className="flex flex-col gap-3 border-b pb-4 last:border-0 last:pb-0"
                key={member.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="grid text-sm">
                    <span className="font-medium">
                      {member.user.name || member.user.email}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {member.user.email}
                    </span>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {member.role}
                  </Badge>
                </div>
                {member.role !== "owner" && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={draft.role}
                        onValueChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [member.id]: {
                              ...draft,
                              role: value as "member" | "admin",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateMember({
                            organizationId,
                            memberId: member.id,
                            role: draft.role,
                            permissions: draft.permissions,
                          })
                        }
                      >
                        Save capabilities
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          removeMember({ organizationId, memberId: member.id })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {MEMBER_CAPABILITIES.map(([key, label]) => (
                        <label
                          className="flex items-center gap-2 text-xs"
                          key={key}
                        >
                          <Checkbox
                            checked={draft.permissions.includes(key)}
                            onCheckedChange={(checked) =>
                              setDrafts((current) => ({
                                ...current,
                                [member.id]: {
                                  ...draft,
                                  permissions: checked
                                    ? [...draft.permissions, key]
                                    : draft.permissions.filter(
                                        (item) => item !== key,
                                      ),
                                },
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {!!invites?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invites.map((invitation) => (
              <div
                className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
                key={invitation.id}
              >
                <div className="grid text-sm">
                  <span>{invitation.email}</span>
                  <span className="text-muted-foreground text-xs">
                    Role: {invitation.role}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    cancelInvitation({ invitationId: invitation.id })
                  }
                >
                  Cancel
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
