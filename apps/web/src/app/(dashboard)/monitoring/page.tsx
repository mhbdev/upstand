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
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

type MetricPoint = {
  time: string;
  cpu: number;
  memoryPercent: number;
};

const byteFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${byteFormatter.format(bytes / 1024 ** exponent)} ${units[exponent]}`;
};

export default function MonitoringPage() {
  const { data: activeOrganization, isPending: organizationPending } =
    authClient.useActiveOrganization();
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const {
    data: stats,
    isPending,
    error,
  } = useQuery({
    ...trpc.server.runtimeStats.queryOptions({
      organizationId: activeOrganization?.id ?? "",
    }),
    enabled: Boolean(activeOrganization?.id),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!stats) return;
    const collectedAt = new Date(stats.collectedAt);
    setHistory((previous) =>
      [
        ...previous,
        {
          time: collectedAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }),
          cpu: stats.cpu,
          memoryPercent: stats.memoryPercent,
        },
      ].slice(-60),
    );
  }, [stats]);

  if (organizationPending || isPending) {
    return (
      <div className="flex min-h-60 items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="size-5" /> Loading server monitoring…
      </div>
    );
  }

  if (!activeOrganization) {
    return (
      <DashboardPage className="text-muted-foreground">
        Select an organization to view server monitoring.
      </DashboardPage>
    );
  }

  if (error || !stats) {
    return (
      <DashboardPage>
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Monitoring is unavailable</CardTitle>
            <CardDescription>
              {error?.message ??
                "The Docker Engine did not return runtime statistics."}
            </CardDescription>
          </CardHeader>
        </Card>
      </DashboardPage>
    );
  }

  const cards = [
    {
      label: "Workload CPU",
      value: `${stats.cpu}%`,
      description: `${stats.cpuCores} host cores available`,
      icon: Cpu,
    },
    {
      label: "Workload memory",
      value: `${formatBytes(stats.memoryUsage * 1024 * 1024)} / ${formatBytes(stats.memoryTotal * 1024 * 1024)}`,
      description: `${stats.memoryPercent}% of Docker host memory`,
      icon: MemoryStick,
    },
    {
      label: "Active containers",
      value: String(stats.activeContainers),
      description: "Running on this manager",
      icon: Server,
    },
    {
      label: "Docker storage",
      value: formatBytes(
        stats.dockerImageBytes +
          stats.dockerContainerBytes +
          stats.dockerVolumeBytes,
      ),
      description: "Images, containers, and volumes",
      icon: HardDrive,
    },
  ];

  return (
    <DashboardPage className="gap-6">
      <DashboardPageHeader
        title="Server Monitoring"
        icon={<Activity className="size-6 text-primary" />}
        description={
          <>
            Live Docker Engine telemetry for {stats.serverName}. History begins
            when this page opens and refreshes every five seconds.
          </>
        }
        actions={<Badge variant="outline">Docker {stats.dockerVersion}</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="bg-card">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="font-medium text-muted-foreground text-sm">
                  {card.label}
                </CardTitle>
                <Icon className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="font-semibold text-xl tracking-tight">
                  {card.value}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workload CPU</CardTitle>
            <CardDescription>
              Sum of running container CPU percentages. It can exceed 100% on
              multi-core hosts.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
              >
                <defs>
                  <linearGradient id="server-cpu" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  unit="%"
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="var(--color-primary)"
                  fill="url(#server-cpu)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workload Memory</CardTitle>
            <CardDescription>
              Memory used by Docker-managed workloads against the Docker host
              memory reported by the Engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
              >
                <defs>
                  <linearGradient
                    id="server-memory"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-chart-2)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-chart-2)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  unit="%"
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="memoryPercent"
                  stroke="var(--color-chart-2)"
                  fill="url(#server-memory)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Network className="size-4 text-primary" />
          <div>
            <CardTitle>Container Network Counters</CardTitle>
            <CardDescription>
              Totals since each running container started.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="text-muted-foreground text-xs">Received</p>
            <p className="mt-1 font-semibold text-lg">
              {formatBytes(stats.networkRxBytes)}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="text-muted-foreground text-xs">Sent</p>
            <p className="mt-1 font-semibold text-lg">
              {formatBytes(stats.networkTxBytes)}
            </p>
          </div>
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
