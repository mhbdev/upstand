"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { CardContent, CardHeader } from "@upstand/ui/components/card";
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
import { PageEmpty } from "@/components/dashboard/page-empty";
import { PagePagination } from "@/components/dashboard/page-pagination";
import { TableSkeleton } from "@/components/dashboard/page-skeleton";
import { FileClock, Search } from "@/components/huge-icons";
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

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Audit Logs"
        icon={<FileClock className="size-6 text-primary" />}
        description="A complete, organization-scoped history of dashboard and API activity."
      />
      <div>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
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
          {logs.isPending ? <TableSkeleton rows={5} /> : null}
          {!logs.isPending && (logs.data?.items.length ?? 0) === 0 ? (
            <PageEmpty
              icon={FileClock}
              title="No audit events found"
              description="No events match your current search queries or filters."
            />
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
          {logs.data && logs.data.items.length > 0 && (
            <PagePagination
              className="px-4"
              page={page}
              pageSize={pageSize}
              total={logs.data.total}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </div>
    </DashboardPage>
  );
}
