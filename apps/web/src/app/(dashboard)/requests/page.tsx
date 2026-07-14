"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function RequestsPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const requests = useQuery({
    ...trpc.deployment.getRequests.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
    refetchInterval: 5000,
  });
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Requests"
        description="Deployment queue and recent deployment requests across the active installation."
      />
      {requests.isLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Queued requests</CardTitle>
              <CardDescription>Live BullMQ deployment jobs.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {requests.data?.queue.length ? (
                requests.data.queue.map((job) => (
                  <div
                    key={`${job.serverId}-${job.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
                  >
                    <span className="font-medium">{job.resourceName}</span>
                    <span className="text-muted-foreground">{job.label}</span>
                    <Badge
                      variant={
                        job.state === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {job.state}
                    </Badge>
                    <span className="ml-auto text-muted-foreground text-xs">
                      {job.serverName}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No queued requests.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent deployments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {requests.data?.deployments.slice(0, 25).map((deployment) => (
                <div
                  key={deployment.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
                >
                  <span className="font-medium">{deployment.title}</span>
                  <Badge
                    variant={
                      deployment.status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {deployment.status}
                  </Badge>
                  <span className="ml-auto text-muted-foreground text-xs">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardPage>
  );
}
