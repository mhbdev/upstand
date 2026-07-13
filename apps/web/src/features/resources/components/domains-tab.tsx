"use client";

import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Switch } from "@upstand/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

type DomainMapping = {
  host: string;
  path: string;
  internalPath: string;
  stripPath: boolean;
  port: number;
  serviceName?: string;
  https: boolean;
  certificateType: "letsencrypt" | "internal";
  middlewares: string[];
};

interface DomainsTabProps {
  resource: any;
  updateResource: any;
  isUpdatingResource: boolean;
  routingTargets: string[];
}

const emptyDomainMapping = (): DomainMapping => ({
  host: "",
  path: "/",
  internalPath: "/",
  stripPath: true,
  port: 80,
  https: true,
  certificateType: "letsencrypt",
  middlewares: [],
});

const parseDomainMappings = (
  value: string | null | undefined,
): DomainMapping[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const mapping = item as Partial<DomainMapping>;
      return [
        {
          host: typeof mapping.host === "string" ? mapping.host : "",
          path: typeof mapping.path === "string" ? mapping.path : "/",
          internalPath:
            typeof mapping.internalPath === "string"
              ? mapping.internalPath
              : "/",
          stripPath:
            typeof mapping.stripPath === "boolean" ? mapping.stripPath : true,
          port: typeof mapping.port === "number" ? mapping.port : 80,
          serviceName:
            typeof mapping.serviceName === "string"
              ? mapping.serviceName
              : undefined,
          https: typeof mapping.https === "boolean" ? mapping.https : true,
          certificateType:
            mapping.certificateType === "internal" ? "internal" : "letsencrypt",
          middlewares: Array.isArray(mapping.middlewares)
            ? mapping.middlewares
            : [],
        },
      ];
    });
  } catch {
    return [];
  }
};

export function DomainsTab({
  resource,
  updateResource,
  isUpdatingResource,
  routingTargets,
}: DomainsTabProps) {
  const [domainList, setDomainList] = useState<DomainMapping[]>([]);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [editingDomainIndex, setEditingDomainIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (resource) {
      setDomainList(parseDomainMappings(resource.domains));
    }
  }, [resource]);

  const form = useForm({
    defaultValues: emptyDomainMapping(),
    onSubmit: async ({ value }) => {
      const mapping: DomainMapping = {
        host: value.host.trim().toLowerCase(),
        path: value.path.trim(),
        internalPath: value.internalPath.trim(),
        stripPath: value.stripPath,
        port: Number(value.port),
        serviceName:
          resource.type === "compose" ? value.serviceName : undefined,
        https: value.https,
        certificateType: value.certificateType,
        middlewares: value.middlewares,
      };

      const updated = [...domainList];
      if (editingDomainIndex !== null) {
        updated[editingDomainIndex] = mapping;
      } else {
        updated.push(mapping);
      }

      updateResource(
        { id: resource.id, domains: JSON.stringify(updated) },
        {
          onSuccess: () => {
            toast.success("Domain mapping updated successfully");
            setDomainDialogOpen(false);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        host: z
          .string()
          .min(1, "Hostname is required")
          .regex(
            /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
            "Enter a valid hostname such as app.example.com",
          ),
        port: z
          .number()
          .min(1, "Port must be >= 1")
          .max(65535, "Port must be <= 65535"),
        path: z.string().startsWith("/", "Path must start with '/'"),
        internalPath: z
          .string()
          .startsWith("/", "Internal path must start with '/'"),
        stripPath: z.boolean(),
        https: z.boolean(),
        certificateType: z.enum(["letsencrypt", "internal"]),
        middlewares: z.array(z.string()),
        serviceName: z.string().optional(),
      }),
    },
  });

  const editDomain = (idx: number) => {
    setEditingDomainIndex(idx);
    const domain = domainList[idx];
    form.reset();
    Object.entries(domain).forEach(([k, v]) => {
      form.setFieldValue(k as any, v as any);
    });
    setDomainDialogOpen(true);
  };

  const deleteDomain = (idx: number) => {
    if (!confirm("Are you sure you want to remove this domain mapping?"))
      return;
    const updated = domainList.filter((_, i) => i !== idx);
    updateResource(
      { id: resource.id, domains: JSON.stringify(updated) },
      {
        onSuccess: () => {
          toast.success("Domain mapping removed");
        },
      },
    );
  };

  const openAddDomain = () => {
    setEditingDomainIndex(null);
    form.reset();
    setDomainDialogOpen(true);
  };

  return (
    <Card className="border border-border/40 bg-card/20">
      <CardHeader>
        <CardTitle className="font-semibold text-lg">Domains & HTTPS</CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Route a public hostname to a service on the overlay network. HTTPS
          uses Caddy Automatic HTTPS and Let's Encrypt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 border-border/20 border-t pt-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="font-medium text-sm">Public routes</p>
            <p className="font-normal text-muted-foreground text-xs">
              Add hostnames and route them to this resource's internal service.
            </p>
          </div>
          <Button type="button" onClick={openAddDomain}>
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            Add domain
          </Button>
        </div>

        {domainList.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border/20">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 text-muted-foreground text-xs uppercase">
                  <TableHead>Hostname</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainList.map((item, idx) => (
                  <TableRow key={`${item.host}:${item.path}`}>
                    <TableCell>
                      <div className="flex min-w-48 flex-col gap-1">
                        <span className="font-medium text-primary">
                          {item.host}
                        </span>
                        <span className="font-normal text-muted-foreground text-xs">
                          {item.stripPath
                            ? "Path prefix removed"
                            : "Path preserved"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-28 font-mono text-xs">
                      <div>{item.path}</div>
                      {item.internalPath !== "/" && (
                        <div className="font-normal text-muted-foreground">
                          → {item.internalPath}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-40 font-mono text-muted-foreground text-xs">
                      {item.serviceName || resource?.appName || resource?.name
                        ? `${item.serviceName || resource?.appName || resource?.name}:${item.port}`
                        : item.port}
                    </TableCell>
                    <TableCell className="min-w-32">
                      <Badge variant={item.https ? "default" : "secondary"}>
                        {item.https
                          ? item.certificateType === "internal"
                            ? "HTTPS / Internal CA"
                            : "HTTPS / Let’s Encrypt"
                          : "HTTP only"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        onClick={() => editDomain(idx)}
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${item.host}${item.path}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        onClick={() => deleteDomain(idx)}
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${item.host}${item.path}`}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No external domains linked.
          </div>
        )}
      </CardContent>

      <Dialog open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingDomainIndex !== null
                ? "Edit domain route"
                : "Link domain hostname"}
            </DialogTitle>
            <DialogDescription>
              Assign a hostname and path rule to route traffic from public ports
              to the container overlay port.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <form.Field
                  name="host"
                  validators={{
                    onChange: z.string().min(1, "Hostname is required"),
                  }}
                >
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        Domain Hostname
                      </FieldLabel>
                      <Input
                        id={field.name}
                        placeholder="app.example.com"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="port">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Target Port</FieldLabel>
                      <Input
                        id={field.name}
                        type="number"
                        placeholder="80"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value))
                        }
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              </div>

              {resource.type === "compose" && (
                <form.Field name="serviceName">
                  {(field) => (
                    <Field>
                      <FieldLabel>Compose Service Target</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(val) =>
                          field.handleChange(val || undefined)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a Compose service" />
                        </SelectTrigger>
                        <SelectContent>
                          {routingTargets.map((target) => (
                            <SelectItem key={target} value={target}>
                              {target}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="path">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        Public Path Prefix
                      </FieldLabel>
                      <Input
                        id={field.name}
                        placeholder="/"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="internalPath">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        Internal Path Target
                      </FieldLabel>
                      <Input
                        id={field.name}
                        placeholder="/"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              </div>

              <form.Field name="stripPath">
                {(field) => (
                  <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    <Switch
                      checked={field.state.value}
                      onCheckedChange={(val) => field.handleChange(val)}
                    />{" "}
                    Strip Path Prefix before passing request downstream.
                  </label>
                )}
              </form.Field>

              <form.Field name="https">
                {(field) => (
                  <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    <Switch
                      checked={field.state.value}
                      onCheckedChange={(val) => field.handleChange(val)}
                    />{" "}
                    Force HTTPS Redirection.
                  </label>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.https}>
                {(https) =>
                  https ? (
                    <form.Field name="certificateType">
                      {(field) => (
                        <Field>
                          <FieldLabel>SSL Certificate Type</FieldLabel>
                          <Select
                            value={field.state.value}
                            onValueChange={(val) =>
                              field.handleChange(
                                (val || "letsencrypt") as
                                  | "letsencrypt"
                                  | "internal",
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="letsencrypt">
                                Let's Encrypt Public Certificate
                              </SelectItem>
                              <SelectItem value="internal">
                                Internal CA Self-Signed Certificate
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDomainDialogOpen(false)}
              >
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                })}
              >
                {({ canSubmit }) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || isUpdatingResource}
                  >
                    {editingDomainIndex !== null
                      ? "Save Changes"
                      : "Link Domain"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
