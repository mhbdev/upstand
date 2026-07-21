"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  ComputerIcon,
  DatabaseIcon,
  Delete02Icon,
  PlusSignIcon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DATABASE_IMAGE_OPTIONS, type DatabaseType } from "@upstand/domain";
import { env } from "@upstand/env/web";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@upstand/ui/components/dropdown-menu";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@upstand/ui/components/tabs";
import { cn } from "@upstand/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KeyValueEditor,
  keyValuePairsToRecord,
  recordToKeyValuePairs,
} from "@/components/shared/key-value-editor";
import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

// ─── Icons Map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, IconSvgElement> = {
  application: ComputerIcon,
  database: DatabaseIcon,
  compose: ServerStack01Icon,
};

const TYPE_BG: Record<string, string> = {
  application: "bg-primary/10 text-primary",
  database: "bg-amber-500/10 text-amber-500",
  compose: "bg-violet-500/10 text-violet-500",
};

// ─── Resource Card ────────────────────────────────────────────────────────────

function ResourceCard({
  projectId,
  environmentId,
  resource,
  onDelete,
}: {
  projectId: string;
  environmentId: string;
  resource: {
    id: string;
    name: string;
    type: string;
    status: string;
    provider: string;
  };
  onDelete: () => void;
}) {
  const Icon = TYPE_ICONS[resource.type] || ComputerIcon;
  const isRunning = resource.status === "running";

  return (
    <div className="group relative flex flex-col justify-between border border-border/40 bg-card/30 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-accent/5 hover:shadow-lg">
      <Link
        href={`/projects/${projectId}/${environmentId}/${resource.id}` as any}
        className="absolute inset-0"
        aria-label={`Open resource ${resource.name}`}
      />
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center",
                TYPE_BG[resource.type],
              )}
            >
              <HugeiconsIcon icon={Icon} className="size-4" />
            </div>
            <div>
              <h3 className="line-clamp-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                {resource.name}
              </h3>
              <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                {resource.type}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/30 bg-accent/20 px-2 py-0.5">
            <span className={cn("relative flex h-2 w-2")}>
              {isRunning && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  isRunning ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
            </span>
            <span className="font-semibold text-[10px] text-foreground uppercase tracking-wider">
              {resource.status}
            </span>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <p className="text-muted-foreground text-xs">
            Provider:{" "}
            <span className="font-medium text-foreground uppercase">
              {resource.provider}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end border-border/30 border-t pt-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="relative z-10 p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete resource ${resource.name}`}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
        </button>
      </div>
    </div>
  );
}

function CreateAppDialog({
  open,
  onOpenChange,
  environmentId,
  projectName,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  environmentId: string;
  projectName: string;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [appName, setAppName] = useState("");
  const [description, setDescription] = useState("");
  const isCloud = env.NEXT_PUBLIC_IS_CLOUD;
  const [serverId, setServerId] = useState(() => (isCloud ? "" : "local"));

  const { data: servers = [] } = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const handleNameChange = (val: string) => {
    setName(val);
    const prefix = projectName
      ? `${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-`
      : "";
    const suffix = val.toLowerCase().replace(/[^a-z0-9]/g, "-");
    setAppName(prefix + suffix);
  };

  const mutation = useMutation({
    ...trpc.resource.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Application created successfully");
      setName("");
      setAppName("");
      setDescription("");
      setServerId(isCloud ? "" : "local");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to create application"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,42rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:min-w-[32rem]">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">
            New Application
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Deploy a new app in this environment.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && appName.trim()) {
              if (isCloud && (!serverId || serverId === "local")) {
                toast.error("Please select a target server for deployment.");
                return;
              }
              mutation.mutate({
                environmentId,
                name: name.trim(),
                type: "application",
                appName: appName.trim(),
                description: description.trim() || undefined,
                serverId: serverId === "local" ? undefined : serverId,
              });
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label htmlFor="app-name">Name</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. node-api"
              autoComplete="off"
              autoFocus
              className="border-border/40 focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-service-name">Docker Swarm Service Name</Label>
            <Input
              id="app-service-name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. node-api"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-server">Target Server</Label>
            <Select
              items={[
                ...(!isCloud
                  ? [{ value: "local", label: "Local Server (Leader)" }]
                  : []),
                ...(servers ?? [])
                  .filter((srv: any) => srv.status === "ready")
                  .map((srv: any) => ({
                    value: srv.id,
                    label: `${srv.name} (${srv.ipAddress})`,
                  })),
              ]}
              value={serverId}
              onValueChange={(value) => value && setServerId(value)}
            >
              <SelectTrigger
                id="app-server"
                className="border-border/40 focus:border-primary"
              >
                <SelectValue
                  placeholder={isCloud ? "Select Server" : "Local Server"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {!isCloud && (
                    <SelectItem value="local">Local Server (Leader)</SelectItem>
                  )}
                  {servers
                    ?.filter((srv: any) => srv.status === "ready")
                    ?.map((srv: any) => (
                      <SelectItem key={srv.id} value={srv.id}>
                        {srv.name} ({srv.ipAddress})
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Select which server node in your cluster to deploy this
              application on.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-desc">Description</Label>
            <Input
              id="app-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="App description (optional)"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="font-medium"
              disabled={mutation.isPending || !name.trim() || !appName.trim()}
            >
              {mutation.isPending ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const generatePassword = (length = 16) => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

function CreateDbDialog({
  open,
  onOpenChange,
  environmentId,
  projectName,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  environmentId: string;
  projectName: string;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [appName, setAppName] = useState("");
  const [dbType, setDbType] = useState<DatabaseType>("postgres");
  const [dockerImage, setDockerImage] = useState<string>(
    DATABASE_IMAGE_OPTIONS.postgres[0],
  );
  const [customImage, setCustomImage] = useState("");
  const [description, setDescription] = useState("");
  const isCloud = env.NEXT_PUBLIC_IS_CLOUD;
  const [serverId, setServerId] = useState(() => (isCloud ? "" : "local"));

  const { data: servers = [] } = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const [dbUser, setDbUser] = useState("upstand_user");
  const [dbPassword, setDbPassword] = useState("");
  const [dbName, setDbName] = useState("upstand_db");
  const [dbRootPassword, setDbRootPassword] = useState("");
  const [externalPort, setExternalPort] = useState("");
  const [libsqlGrpcPort, setLibsqlGrpcPort] = useState("");
  const [libsqlAdminPort, setLibsqlAdminPort] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleNameChange = (val: string) => {
    setName(val);
    const prefix = projectName
      ? `${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-`
      : "";
    const suffix = val.toLowerCase().replace(/[^a-z0-9]/g, "-");
    setAppName(prefix + suffix);
  };

  const handleDbTypeChange = useCallback((val: DatabaseType | null) => {
    if (!val) return;
    setDbType(val);
    setDockerImage(DATABASE_IMAGE_OPTIONS[val][0]);
    setCustomImage("");
    setExternalPort("");
    setLibsqlGrpcPort("");
    setLibsqlAdminPort("");
    const pass = generatePassword();
    const rootPass = generatePassword();
    setDbPassword(pass);
    setDbRootPassword(rootPass);

    if (val === "redis") {
      setDbUser("");
      setDbName("");
    } else if (val === "mongodb") {
      setDbUser("admin");
      setDbName("");
    } else {
      setDbUser("upstand_user");
      setDbName("upstand_db");
    }
    setFormErrors({});
  }, []);

  useEffect(() => {
    if (open) {
      setName("");
      setAppName("");
      setDescription("");
      handleDbTypeChange("postgres");
    }
  }, [open, handleDbTypeChange]);

  const mutation = useMutation({
    ...trpc.resource.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Database created successfully");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message || "Failed to create database"),
  });

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Database name is required";
    if (!appName.trim())
      errors.appName = "Docker Swarm Service Name is required";

    if (dbType !== "redis") {
      if (!dbUser.trim()) errors.dbUser = "Database user is required";
    }
    if (dbType !== "redis" && dbType !== "mongodb") {
      if (!dbName.trim()) errors.dbName = "Database name (catalog) is required";
    }
    if (!dbPassword.trim()) {
      errors.dbPassword = "Password is required";
    }

    if (
      (dbType === "mysql" || dbType === "mariadb") &&
      !dbRootPassword.trim()
    ) {
      errors.dbRootPassword = "Root password is required";
    }
    if (dbType === "libsql") {
      const ports = [externalPort, libsqlGrpcPort, libsqlAdminPort]
        .filter((value) => value.trim().length > 0)
        .map((value) => Number(value));
      if (
        ports.some(
          (port) => !Number.isInteger(port) || port < 1 || port > 65535,
        )
      ) {
        errors.libsqlPorts = "Published ports must be integers from 1 to 65535";
      } else if (new Set(ports).size !== ports.length) {
        errors.libsqlPorts = "libSQL published ports must be distinct";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,48rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:min-w-[36rem]">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">New Database</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Deploy a new managed database in this environment.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (validateForm()) {
              if (isCloud && (!serverId || serverId === "local")) {
                toast.error("Please select a target server for deployment.");
                return;
              }
              const credsPayload = JSON.stringify({
                dbUser: dbUser.trim(),
                dbPassword: dbPassword.trim(),
                dbName: dbName.trim(),
                dbRootPassword: dbRootPassword.trim(),
              });

              mutation.mutate({
                environmentId,
                name: name.trim(),
                type: "database",
                appName: appName.trim(),
                description: description.trim() || undefined,
                dbType,
                dockerImage: customImage.trim() || dockerImage,
                allowCustomImage: Boolean(customImage.trim()),
                credentials: credsPayload,
                externalPort: externalPort.trim()
                  ? Number(externalPort)
                  : undefined,
                libsqlGrpcPort:
                  dbType === "libsql" && libsqlGrpcPort.trim()
                    ? Number(libsqlGrpcPort)
                    : undefined,
                libsqlAdminPort:
                  dbType === "libsql" && libsqlAdminPort.trim()
                    ? Number(libsqlAdminPort)
                    : undefined,
                serverId: serverId === "local" ? undefined : serverId,
              });
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="db-type">Database Engine</Label>
              <Select
                items={[
                  { value: "postgres", label: "PostgreSQL" },
                  { value: "mysql", label: "MySQL" },
                  { value: "mariadb", label: "MariaDB" },
                  { value: "mongodb", label: "MongoDB" },
                  { value: "redis", label: "Redis" },
                  { value: "libsql", label: "libSQL" },
                ]}
                value={dbType}
                onValueChange={handleDbTypeChange}
              >
                <SelectTrigger id="db-type">
                  <SelectValue placeholder="Select Engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mariadb">MariaDB</SelectItem>
                  <SelectItem value="mongodb">MongoDB</SelectItem>
                  <SelectItem value="redis">Redis</SelectItem>
                  <SelectItem value="libsql">libSQL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="db-image">Image version</Label>
              <Select
                items={DATABASE_IMAGE_OPTIONS[dbType].map((image) => ({
                  value: image,
                  label: image,
                }))}
                value={dockerImage}
                onValueChange={(value) => {
                  if (value) {
                    setCustomImage("");
                    setDockerImage(value);
                  }
                }}
              >
                <SelectTrigger id="db-image">
                  <SelectValue placeholder="Select image version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DATABASE_IMAGE_OPTIONS[dbType].map((image) => (
                      <SelectItem key={image} value={image}>
                        {image}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Choose a supported official image or enter a validated custom
                image below.
              </p>
              <Input
                value={customImage}
                onChange={(event) => setCustomImage(event.target.value)}
                placeholder="Custom image, e.g. ghcr.io/acme/postgres:17"
                className="border-border/40"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              value={name}
              onChange={(e) => {
                handleNameChange(e.target.value);
                if (formErrors.name)
                  setFormErrors((prev) => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. users-db"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
            {formErrors.name && (
              <span className="text-[10px] text-red-500">
                {formErrors.name}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-service-name">Docker Swarm Service Name</Label>
            <Input
              id="db-service-name"
              value={appName}
              onChange={(e) => {
                setAppName(e.target.value);
                if (formErrors.appName)
                  setFormErrors((prev) => ({ ...prev, appName: "" }));
              }}
              placeholder="e.g. users-db"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
            {formErrors.appName && (
              <span className="text-[10px] text-red-500">
                {formErrors.appName}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="db-server">Target Server</Label>
            <Select
              items={[
                ...(!isCloud
                  ? [{ value: "local", label: "Local Server (Leader)" }]
                  : []),
                ...(servers ?? [])
                  .filter((srv: any) => srv.status === "ready")
                  .map((srv: any) => ({
                    value: srv.id,
                    label: `${srv.name} (${srv.ipAddress})`,
                  })),
              ]}
              value={serverId}
              onValueChange={(value) => value && setServerId(value)}
            >
              <SelectTrigger id="db-server">
                <SelectValue
                  placeholder={isCloud ? "Select Server" : "Local Server"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {!isCloud && (
                    <SelectItem value="local">Local Server (Leader)</SelectItem>
                  )}
                  {servers
                    ?.filter((srv: any) => srv.status === "ready")
                    ?.map((srv: any) => (
                      <SelectItem key={srv.id} value={srv.id}>
                        {srv.name} ({srv.ipAddress})
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Select which server node in your cluster to deploy this database
              on.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-border/30 bg-muted/10 p-4">
            <div>
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Published Ports
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                Leave blank to use the engine default. libSQL publishes HTTP
                8080, gRPC 5001, and admin 5000 inside the container.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="db-external-port">
                  {dbType === "libsql" ? "HTTP port" : "External port"}
                </Label>
                <Input
                  id="db-external-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={externalPort}
                  onChange={(event) => setExternalPort(event.target.value)}
                  placeholder={dbType === "libsql" ? "8080" : "Auto"}
                  className="border-border/40"
                />
              </div>
              {dbType === "libsql" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="db-libsql-grpc-port">gRPC port</Label>
                    <Input
                      id="db-libsql-grpc-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={libsqlGrpcPort}
                      onChange={(event) =>
                        setLibsqlGrpcPort(event.target.value)
                      }
                      placeholder="5001"
                      className="border-border/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-libsql-admin-port">Admin port</Label>
                    <Input
                      id="db-libsql-admin-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={libsqlAdminPort}
                      onChange={(event) =>
                        setLibsqlAdminPort(event.target.value)
                      }
                      placeholder="5000"
                      className="border-border/40"
                    />
                  </div>
                </>
              )}
            </div>
            {formErrors.libsqlPorts && (
              <span className="text-[10px] text-red-500">
                {formErrors.libsqlPorts}
              </span>
            )}
          </div>

          {/* Credentials Fields based on DB Type */}
          <div className="space-y-4 rounded-xl border border-border/30 bg-muted/10 p-4">
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              Database Credentials Configuration
            </h3>

            {dbType !== "redis" && (
              <div className="space-y-2">
                <Label htmlFor="db-user">
                  {dbType === "mongodb" ? "Root Username" : "Database Username"}
                </Label>
                <Input
                  id="db-user"
                  value={dbUser}
                  onChange={(e) => {
                    setDbUser(e.target.value);
                    if (formErrors.dbUser)
                      setFormErrors((prev) => ({ ...prev, dbUser: "" }));
                  }}
                  placeholder="e.g. admin"
                  autoComplete="off"
                  className="border-border/40 bg-muted/20 focus:border-primary"
                />
                {formErrors.dbUser && (
                  <span className="text-[10px] text-red-500">
                    {formErrors.dbUser}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="db-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="db-password"
                  value={dbPassword}
                  onChange={(e) => {
                    setDbPassword(e.target.value);
                    if (formErrors.dbPassword)
                      setFormErrors((prev) => ({ ...prev, dbPassword: "" }));
                  }}
                  placeholder="Password"
                  autoComplete="off"
                  className="border-border/40 bg-muted/20 font-mono focus:border-primary"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDbPassword(generatePassword())}
                  className="h-9 shrink-0 cursor-pointer px-3 text-xs"
                >
                  Regen
                </Button>
              </div>
              {formErrors.dbPassword && (
                <span className="text-[10px] text-red-500">
                  {formErrors.dbPassword}
                </span>
              )}
            </div>

            {(dbType === "mysql" || dbType === "mariadb") && (
              <div className="space-y-2">
                <Label htmlFor="db-root-password">Root Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="db-root-password"
                    value={dbRootPassword}
                    onChange={(e) => {
                      setDbRootPassword(e.target.value);
                      if (formErrors.dbRootPassword)
                        setFormErrors((prev) => ({
                          ...prev,
                          dbRootPassword: "",
                        }));
                    }}
                    placeholder="Root Password"
                    autoComplete="off"
                    className="border-border/40 bg-muted/20 font-mono focus:border-primary"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDbRootPassword(generatePassword())}
                    className="h-9 shrink-0 cursor-pointer px-3 text-xs"
                  >
                    Regen
                  </Button>
                </div>
                {formErrors.dbRootPassword && (
                  <span className="text-[10px] text-red-500">
                    {formErrors.dbRootPassword}
                  </span>
                )}
              </div>
            )}

            {dbType !== "redis" && dbType !== "mongodb" && (
              <div className="space-y-2">
                <Label htmlFor="db-catalog-name">Database Name</Label>
                <Input
                  id="db-catalog-name"
                  value={dbName}
                  onChange={(e) => {
                    setDbName(e.target.value);
                    if (formErrors.dbName)
                      setFormErrors((prev) => ({ ...prev, dbName: "" }));
                  }}
                  placeholder="e.g. app_db"
                  autoComplete="off"
                  className="border-border/40 bg-muted/20 focus:border-primary"
                />
                {formErrors.dbName && (
                  <span className="text-[10px] text-red-500">
                    {formErrors.dbName}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="db-desc">Description</Label>
            <Input
              id="db-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="DB description (optional)"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="font-medium"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateComposeDialog({
  open,
  onOpenChange,
  environmentId,
  projectName,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  environmentId: string;
  projectName: string;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [appName, setAppName] = useState("");
  const [composeType, setComposeType] = useState<"stack" | "compose">(
    "compose",
  );
  const [description, setDescription] = useState("");
  const isCloud = env.NEXT_PUBLIC_IS_CLOUD;
  const [serverId, setServerId] = useState(() => (isCloud ? "" : "local"));

  const { data: servers = [] } = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const handleNameChange = (val: string) => {
    setName(val);
    const prefix = projectName
      ? `${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-`
      : "";
    const suffix = val.toLowerCase().replace(/[^a-z0-9]/g, "-");
    setAppName(prefix + suffix);
  };

  const mutation = useMutation({
    ...trpc.resource.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker Compose service created");
      setName("");
      setAppName("");
      setDescription("");
      setServerId(isCloud ? "" : "local");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to create compose service"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,42rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:min-w-[32rem]">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">
            New Docker Compose
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Deploy a multi-container stack or Docker Compose service.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && appName.trim()) {
              if (isCloud && (!serverId || serverId === "local")) {
                toast.error("Please select a target server for deployment.");
                return;
              }
              mutation.mutate({
                environmentId,
                name: name.trim(),
                type: "compose",
                appName: appName.trim(),
                composeType,
                description: description.trim() || undefined,
                serverId: serverId === "local" ? undefined : serverId,
              });
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label htmlFor="comp-name">Name</Label>
            <Input
              id="comp-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. monitoring-stack"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comp-service-name">
              Docker Swarm Stack / App Name
            </Label>
            <Input
              id="comp-service-name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. monitoring-stack"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comp-server">Target Server</Label>
            <Select
              items={[
                ...(!isCloud
                  ? [{ value: "local", label: "Local Server (Leader)" }]
                  : []),
                ...(servers ?? [])
                  .filter((srv: any) => srv.status === "ready")
                  .map((srv: any) => ({
                    value: srv.id,
                    label: `${srv.name} (${srv.ipAddress})`,
                  })),
              ]}
              value={serverId}
              onValueChange={(value) => value && setServerId(value)}
            >
              <SelectTrigger id="comp-server">
                <SelectValue
                  placeholder={isCloud ? "Select Server" : "Local Server"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {!isCloud && (
                    <SelectItem value="local">Local Server (Leader)</SelectItem>
                  )}
                  {servers
                    ?.filter((srv: any) => srv.status === "ready")
                    ?.map((srv: any) => (
                      <SelectItem key={srv.id} value={srv.id}>
                        {srv.name} ({srv.ipAddress})
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Select which server node in your cluster to deploy this Compose
              stack on.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comp-type">Compose Format</Label>
            <Select
              items={[
                { value: "compose", label: "Standard Docker Compose" },
                { value: "stack", label: "Docker Swarm Stack" },
              ]}
              value={composeType}
              onValueChange={(val: any) => setComposeType(val)}
            >
              <SelectTrigger id="comp-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compose">Standard Docker Compose</SelectItem>
                <SelectItem value="stack">Docker Swarm Stack</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comp-desc">Description</Label>
            <Input
              id="comp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Stack description (optional)"
              autoComplete="off"
              className="border-border/40 focus:border-primary"
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="font-medium"
              disabled={mutation.isPending || !name.trim() || !appName.trim()}
            >
              {mutation.isPending ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Resource Dialog ────────────────────────────────────────────────────

function DeleteResourceDialog({
  open,
  onOpenChange,
  resource,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resource: { id: string; name: string } | null;
  onDeleted: () => void;
}) {
  const mutation = useMutation({
    ...trpc.resource.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Resource deleted successfully");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err) => toast.error(err.message || "Failed to delete resource"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-destructive/30 bg-card shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-destructive text-xl">
            <HugeiconsIcon icon={Alert02Icon} className="size-5" />
            Delete Resource
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {resource?.name}
            </span>
            ? This action is permanent and will stop any running instances.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            className="gap-2"
            onClick={() => {
              if (resource) {
                mutation.mutate({ id: resource.id });
              }
            }}
          >
            {mutation.isPending && <Spinner className="size-4" />}
            Delete Resource
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail ───────────────────────────────────────────────────────────────

export default function EnvironmentDetail({
  projectId,
  environmentId,
}: {
  projectId: string;
  environmentId: string;
  session: typeof authClient.$Infer.Session;
}) {
  const router = useRouter();
  const [createAppOpen, setCreateAppOpen] = useState(false);
  const [createDbOpen, setCreateDbOpen] = useState(false);
  const [createComposeOpen, setCreateComposeOpen] = useState(false);
  const [deleteResOpen, setDeleteResOpen] = useState(false);
  const [selectedRes, setSelectedRes] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch project
  const { data: project } = useQuery({
    ...trpc.project.get.queryOptions({ id: projectId }),
  });

  // Fetch environment details
  const { data: env, isPending: loadingEnv } = useQuery({
    ...trpc.environment.get.queryOptions({ id: environmentId }),
  });

  // Fetch resources
  const {
    data: resources,
    isPending: loadingResources,
    refetch: refetchResources,
  } = useQuery({
    ...trpc.resource.list.queryOptions({ environmentId }),
  });

  // Delete environment mutation
  const deleteEnvMutation = useMutation({
    ...trpc.environment.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Environment deleted successfully");
      router.push(`/projects/${projectId}` as any);
    },
    onError: (err) =>
      toast.error(err.message || "Failed to delete environment"),
  });

  const queryClient = useQueryClient();
  const [envList, setEnvList] = useState<Array<{ key: string; value: string }>>(
    [],
  );

  const updateEnvMutation = useMutation({
    ...trpc.environment.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Project environment variables saved successfully");
      void queryClient.invalidateQueries({
        queryKey: trpc.environment.get.queryKey({ id: environmentId }),
      });
    },
    onError: (err) =>
      toast.error(
        err.message || "Failed to update project environment variables",
      ),
  });

  useEffect(() => {
    if (env?.envVars) {
      setEnvList(recordToKeyValuePairs(env.envVars));
    } else {
      setEnvList([]);
    }
  }, [env?.envVars]);

  if (loadingEnv) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!env || !project) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 overflow-x-hidden px-4 py-8 text-center">
        <p className="text-muted-foreground">Environment not found.</p>
        <Link href={`/projects/${projectId}` as any}>
          <Button variant="outline">Back to Project</Button>
        </Link>
      </div>
    );
  }

  const filteredResources =
    resources?.filter((res: any) =>
      res.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  const hasResources = (resources?.length ?? 0) > 0;
  const isDefaultEnv = env.isDefault || env.isProtected;

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8 overflow-x-hidden px-4 py-8 md:px-8">
      {/* Breadcrumbs / Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Link
            href={"/projects" as any}
            className="transition-colors hover:text-primary"
          >
            Projects
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <Link
            href={`/projects/${projectId}` as any}
            className="transition-colors hover:text-primary"
          >
            {project.name}
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <span className="font-medium text-foreground">{env.name}</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-bold text-2xl text-foreground">
              {env.name} Environment
            </h1>
            <p className="text-muted-foreground text-sm">
              Deploy and manage apps, databases, and microservices.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources…"
              className="w-full min-w-0 border-border/40 bg-card/30 sm:w-64"
            />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 border-none bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90">
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                New Resource
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 border border-border/45 bg-card shadow-xl"
              >
                <DropdownMenuItem onClick={() => setCreateAppOpen(true)}>
                  <HugeiconsIcon
                    icon={ComputerIcon}
                    className="mr-2 size-4 text-primary"
                  />
                  Application
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateDbOpen(true)}>
                  <HugeiconsIcon
                    icon={DatabaseIcon}
                    className="mr-2 size-4 text-amber-500"
                  />
                  Database
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateComposeOpen(true)}>
                  <HugeiconsIcon
                    icon={ServerStack01Icon}
                    className="mr-2 size-4 text-violet-500"
                  />
                  Docker Compose
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="resources" className="min-w-0 space-y-6">
        <TabsList className="w-full max-w-full justify-start gap-1 overflow-x-auto border border-border/40 bg-card/45 p-1 [scrollbar-width:thin]">
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="env-vars">Shared Variables</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="resources" className="outline-none">
          {loadingResources ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : filteredResources.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredResources.map((res) => (
                <ResourceCard
                  key={res.id}
                  projectId={projectId}
                  environmentId={environmentId}
                  resource={res}
                  onDelete={() => {
                    setSelectedRes(res);
                    setDeleteResOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No resources found in this environment.
            </div>
          )}
        </TabsContent>

        <TabsContent value="env-vars" className="outline-none">
          <div className="max-w-4xl space-y-6">
            <Card className="border border-border/40 bg-card/20">
              <CardHeader>
                <CardTitle className="font-semibold text-lg">
                  Project Environment Variables
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  Configure shared environment variables accessible to all
                  resources in the <strong>{env.name}</strong> environment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 border-border/20 border-t pt-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-primary text-xs leading-relaxed">
                  <p className="mb-1 font-semibold text-sm">
                    How to reference in service environments:
                  </p>
                  To use these variables in your service environments, reference
                  them using the syntax:
                  <code className="mx-1 rounded border border-border/20 bg-background/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {"DATABASE_URL=${{project.DATABASE_URL}}"}
                  </code>
                  . They will be resolved and replaced dynamically during
                  deployment.
                </div>

                <KeyValueEditor
                  value={envList}
                  onChange={setEnvList}
                  addLabel="Add shared variable"
                />

                <div className="flex justify-end border-border/20 border-t pt-4">
                  <Button
                    onClick={() => {
                      updateEnvMutation.mutate({
                        id: environmentId,
                        envVars: keyValuePairsToRecord(envList),
                      });
                    }}
                    disabled={updateEnvMutation.isPending}
                    className="gap-2"
                  >
                    {updateEnvMutation.isPending && (
                      <Spinner className="size-4" />
                    )}
                    Save Environment Variables
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="outline-none">
          <div className="max-w-2xl space-y-6">
            <Card className="border border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="font-semibold text-destructive">
                  Delete Environment
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Permanently delete this environment. This will stop and delete
                  all services running under this environment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isDefaultEnv ? (
                  <div className="flex items-start gap-3 border border-amber-500/20 bg-amber-500/5 p-4 text-amber-500 text-sm">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      className="mt-0.5 size-5 shrink-0"
                    />
                    <div>
                      <p className="font-semibold">
                        Default environment is protected
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        The production/default environment is required and
                        cannot be deleted.
                      </p>
                    </div>
                  </div>
                ) : hasResources ? (
                  <div className="flex items-start gap-3 border border-amber-500/20 bg-amber-500/5 p-4 text-amber-500 text-sm">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      className="mt-0.5 size-5 shrink-0"
                    />
                    <div>
                      <p className="font-semibold">Environment is not empty</p>
                      <p className="mt-1 text-muted-foreground">
                        Please delete all resources inside this environment
                        before attempting deletion.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    This environment is empty and safe to delete.
                  </p>
                )}
                <Button
                  variant="destructive"
                  disabled={
                    isDefaultEnv || hasResources || deleteEnvMutation.isPending
                  }
                  className="gap-2"
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to delete this environment?",
                      )
                    ) {
                      deleteEnvMutation.mutate({ id: environmentId });
                    }
                  }}
                >
                  {deleteEnvMutation.isPending && (
                    <Spinner className="size-4" />
                  )}
                  Delete Environment
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <CreateAppDialog
        open={createAppOpen}
        onOpenChange={setCreateAppOpen}
        environmentId={environmentId}
        projectName={project.name}
        organizationId={project.organizationId}
        onCreated={refetchResources}
      />

      <CreateDbDialog
        open={createDbOpen}
        onOpenChange={setCreateDbOpen}
        environmentId={environmentId}
        projectName={project.name}
        organizationId={project.organizationId}
        onCreated={refetchResources}
      />

      <CreateComposeDialog
        open={createComposeOpen}
        onOpenChange={setCreateComposeOpen}
        environmentId={environmentId}
        projectName={project.name}
        organizationId={project.organizationId}
        onCreated={refetchResources}
      />

      <DeleteResourceDialog
        open={deleteResOpen}
        onOpenChange={setDeleteResOpen}
        resource={selectedRes}
        onDeleted={refetchResources}
      />
    </div>
  );
}
