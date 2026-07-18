"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import {
  ChevronLeft,
  ChevronRight,
  FileClock,
  Search,
} from "@/components/huge-icons";
import { useRequiredActiveOrganization } from "@/hooks/use-required-active-organization";
import { trpc } from "@/utils/trpc";

const ACTIONS = [
  "all",
  "read",
  "create",
  "update",
  "delete",
  "deploy",
  "cancel",
  "run",
  "start",
  "stop",
  "reload",
  "invite",
  "revoke",
  "rotate",
  "test",
  "restore",
  "configure",
];
const RESOURCE_TYPES = [
  "all",
  "project",
  "environment",
  "resource",
  "deployment",
  "server",
  "settings",
  "docker",
  "system",
  "user",
  "organization",
  "certificate",
  "domain",
  "application",
  "database",
  "compose",
  "custom_role",
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AuditLogsPage() {
  const organizationState = useRequiredActiveOrganization();
  const organizationId = organizationState.organizationId as string;
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [resourceType, setResourceType] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const logs = useQuery({
    ...trpc.auditLog.list.queryOptions({
      organizationId,
      search: search.trim() || undefined,
      action: action === "all" ? undefined : (action as never),
      resourceType:
        resourceType === "all" ? undefined : (resourceType as never),
      page,
      pageSize,
    }),
    enabled: organizationState.status === "ready",
  });
  const totalPages = Math.max(1, Math.ceil((logs.data?.total ?? 0) / pageSize));

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Audit logs"
        icon={<FileClock className="size-6 text-primary" />}
        description="A complete, organization-scoped history of dashboard and API activity."
      />
      <Card>
        <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Activity history</CardTitle>
            <CardDescription>
              Sensitive request values are redacted before they are stored.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <div className="relative w-full sm:w-56">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search actor or resource"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              items={ACTIONS.map((item) => ({
                value: item,
                label: item === "all" ? "All actions" : item,
              }))}
              value={action}
              onValueChange={(value) => {
                if (value) {
                  setAction(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item === "all" ? "All actions" : item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={RESOURCE_TYPES.map((item) => ({
                value: item,
                label: item === "all" ? "All resources" : item,
              }))}
              value={resourceType}
              onValueChange={(value) => {
                if (value) {
                  setResourceType(value);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item === "all" ? "All resources" : item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logs.isPending ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading audit logs…
            </div>
          ) : null}
          {!logs.isPending && (logs.data?.items.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No audit events match these filters.
            </div>
          ) : null}
          {(logs.data?.items.length ?? 0) > 0 ? (
            <div className="divide-y">
              {logs.data?.items.map((item) => (
                <article
                  className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:gap-4"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.actorName}</span>
                      <Badge variant="outline">{item.action}</Badge>
                      <span className="text-muted-foreground">
                        {item.resourceType}
                      </span>
                      {item.resourceName ? (
                        <span className="truncate font-medium">
                          {item.resourceName}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {item.actorEmail} · {item.route}
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View event details
                      </summary>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Actor role</dt>
                          <dd>{item.actorRole || "Unknown"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">IP address</dt>
                          <dd>{item.ipAddress || "Not recorded"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Metadata</dt>
                          <dd className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">
                            {JSON.stringify(item.metadata ?? {}, null, 2)}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </div>
                  <time
                    className="shrink-0 text-muted-foreground text-sm"
                    dateTime={item.createdAt.toString()}
                  >
                    {dateFormatter.format(new Date(item.createdAt))}
                  </time>
                </article>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t px-6 py-3 text-muted-foreground text-sm">
            <span>
              {logs.data?.total ?? 0} event{logs.data?.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
