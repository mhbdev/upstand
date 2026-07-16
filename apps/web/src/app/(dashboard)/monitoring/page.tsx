"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  Server,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

type RangeKey = "1h" | "6h" | "24h" | "7d";
type MetricRecord = {
  timestamp: string;
  cpu: string | number;
  memUsed: string | number;
  memTotal: string | number;
  diskUsed: string | number;
  totalDisk: string | number;
  networkIn: string | number;
  networkOut: string | number;
  uptime: number;
  cpuModel: string;
  os: string;
  kernel: string;
  arch: string;
};
type ContainerMetricRecord = {
  timestamp: string;
  CPU: number;
  Memory: {
    percentage: number;
    used: number;
    total: number;
    usedUnit: string;
    totalUnit: string;
  };
  Network: {
    input: number;
    output: number;
    inputUnit: string;
    outputUnit: string;
  };
  BlockIO: { read: number; write: number; readUnit: string; writeUnit: string };
  ID: string;
  Name: string;
};
type ChartPoint = {
  timestamp: string;
  label: string;
  cpu: number;
  memory: number;
  disk: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
  os: string;
  kernel: string;
  arch: string;
  cpuModel: string;
};

const RANGE_OPTIONS: Array<{
  value: RangeKey;
  label: string;
  milliseconds: number;
}> = [
  { value: "1h", label: "Last hour", milliseconds: 60 * 60_000 },
  { value: "6h", label: "Last 6 hours", milliseconds: 6 * 60 * 60_000 },
  { value: "24h", label: "Last 24 hours", milliseconds: 24 * 60 * 60_000 },
  { value: "7d", label: "Last 7 days", milliseconds: 7 * 24 * 60 * 60_000 },
];

const numberValue = (value: string | number | null | undefined) => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent]}`;
};

const formatUptime = (seconds: number) => {
  if (!seconds) return "Unknown";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
};

function MonitoringChart({
  data,
  dataKeys,
  description,
  title,
  yAxisUnit = "%",
}: {
  data: ChartPoint[];
  dataKeys: Array<{ key: keyof ChartPoint; color: string; name: string }>;
  description: string;
  title: string;
  yAxisUnit?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Collecting historical samples…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                unit={yAxisUnit}
              />
              <Tooltip />
              {dataKeys.map((item) => (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.name}
                  stroke={item.color}
                  fill={item.color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-muted-foreground text-sm">
          {label}
        </CardTitle>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-xl tabular-nums tracking-tight">
          {value}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function MonitoringPage() {
  const { data: activeOrganization, isPending: organizationPending } =
    authClient.useActiveOrganization();
  const [selectedServerId, setSelectedServerId] = useState("local");
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const [cpuThreshold, setCpuThreshold] = useState(90);
  const [memoryThreshold, setMemoryThreshold] = useState(90);
  const range = useMemo(() => {
    const option =
      RANGE_OPTIONS.find((item) => item.value === rangeKey) ?? RANGE_OPTIONS[2];
    return {
      from: new Date(Date.now() - option.milliseconds).toISOString(),
      label: option.label,
      limit: rangeKey === "7d" ? "1500" : "800",
    };
  }, [rangeKey]);

  const serversQuery = useQuery({
    ...trpc.server.list.queryOptions({
      organizationId: activeOrganization?.id ?? "",
    }),
    enabled: Boolean(activeOrganization?.id),
  });
  const monitoringSettingsQuery = useQuery({
    ...trpc.server.monitoringSettings.queryOptions({
      organizationId: activeOrganization?.id ?? "",
      serverId: selectedServerId,
    }),
    enabled: Boolean(activeOrganization?.id),
  });
  const monitoringStatusQuery = useQuery({
    ...trpc.server.monitoringStatus.queryOptions({
      organizationId: activeOrganization?.id ?? "",
      serverId: selectedServerId,
    }),
    enabled: Boolean(activeOrganization?.id),
    refetchInterval: 30_000,
  });
  const historicalQuery = useQuery({
    ...trpc.server.historicalMetrics.queryOptions({
      organizationId: activeOrganization?.id ?? "",
      serverId: selectedServerId,
      from: range.from,
      limit: range.limit,
    }),
    enabled:
      Boolean(activeOrganization?.id) &&
      monitoringSettingsQuery.data?.isConfigured === true,
    refetchInterval: 30_000,
  });
  const containerQuery = useQuery({
    ...trpc.server.historicalMetrics.queryOptions({
      organizationId: activeOrganization?.id ?? "",
      serverId: selectedServerId,
      containerMetrics: true,
      from: range.from,
      limit: "1000",
    }),
    enabled:
      Boolean(activeOrganization?.id) &&
      monitoringSettingsQuery.data?.isConfigured === true &&
      historicalQuery.isSuccess,
    refetchInterval: 30_000,
  });
  const runtimeQuery = useQuery({
    ...trpc.server.runtimeStats.queryOptions({
      organizationId: activeOrganization?.id ?? "",
      serverId: selectedServerId === "local" ? undefined : selectedServerId,
    }),
    enabled: Boolean(activeOrganization?.id),
    refetchInterval: 10_000,
  });
  const updateMonitoringSettings = useMutation(
    trpc.server.updateMonitoringSettings.mutationOptions({
      onSuccess: (settings) => {
        setCpuThreshold(settings.cpuThreshold);
        setMemoryThreshold(settings.memoryThreshold);
      },
    }),
  );

  useEffect(() => {
    if (!monitoringSettingsQuery.data) return;
    setCpuThreshold(monitoringSettingsQuery.data.cpuThreshold);
    setMemoryThreshold(monitoringSettingsQuery.data.memoryThreshold);
  }, [monitoringSettingsQuery.data]);

  const history = useMemo<ChartPoint[]>(() => {
    if (!Array.isArray(historicalQuery.data)) return [];
    return (historicalQuery.data as MetricRecord[]).map((metric) => {
      const collectedAt = new Date(metric.timestamp);
      const memoryUsed = numberValue(metric.memUsed);
      return {
        timestamp: metric.timestamp,
        label: collectedAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        cpu: numberValue(metric.cpu),
        memory: memoryUsed,
        disk: numberValue(metric.diskUsed),
        networkIn: numberValue(metric.networkIn),
        networkOut: numberValue(metric.networkOut),
        uptime: metric.uptime,
        os: metric.os,
        kernel: metric.kernel,
        arch: metric.arch,
        cpuModel: metric.cpuModel,
      };
    });
  }, [historicalQuery.data]);

  const containers = useMemo(() => {
    if (!Array.isArray(containerQuery.data)) return [];
    const latest = new Map<string, ContainerMetricRecord>();
    for (const metric of containerQuery.data as ContainerMetricRecord[]) {
      const current = latest.get(metric.Name);
      if (!current || new Date(metric.timestamp) > new Date(current.timestamp))
        latest.set(metric.Name, metric);
    }
    return [...latest.values()].sort((a, b) => b.CPU - a.CPU);
  }, [containerQuery.data]);

  const latest = history.at(-1);
  const stats = runtimeQuery.data;

  if (organizationPending || (runtimeQuery.isPending && !stats)) {
    return (
      <DashboardPage>
        <div className="flex min-h-60 items-center justify-center">
          <Spinner />
        </div>
      </DashboardPage>
    );
  }
  if (!activeOrganization) {
    return (
      <DashboardPage className="text-muted-foreground">
        Select an organization to view server monitoring.
      </DashboardPage>
    );
  }
  if (runtimeQuery.error && !stats) {
    return (
      <DashboardPage>
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Monitoring is unavailable</CardTitle>
            <CardDescription>
              {runtimeQuery.error.message}. Verify the Docker Engine and
              monitoring agent are reachable.
            </CardDescription>
          </CardHeader>
        </Card>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage className="gap-6">
      <DashboardPageHeader
        title="Server Monitoring"
        icon={<Activity className="size-6 text-primary" />}
        description={`Live and persisted host telemetry for ${stats?.serverName ?? "the selected server"}. ${range.label} of history is available.`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select
              items={[
                { value: "local", label: "Local Server" },
                ...(serversQuery.data ?? [])
                  .filter((server) => server.status === "ready")
                  .map((server) => ({
                    value: server.id,
                    label: server.name,
                  })),
              ]}
              value={selectedServerId}
              onValueChange={(value) => value && setSelectedServerId(value)}
            >
              <SelectTrigger
                className="h-9 w-[190px]"
                aria-label="Monitoring server"
              >
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local Server</SelectItem>
                {serversQuery.data
                  ?.filter((server) => server.status === "ready")
                  .map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              items={RANGE_OPTIONS}
              value={rangeKey}
              onValueChange={(value) => value && setRangeKey(value as RangeKey)}
            >
              <SelectTrigger
                className="h-9 w-[150px]"
                aria-label="Monitoring time range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">
              Docker {stats?.dockerVersion ?? "unknown"}
            </Badge>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="min-w-0">
            <p className="font-medium">Monitoring agent</p>
            <p className="truncate text-muted-foreground text-sm">
              {monitoringStatusQuery.data?.status === "not_configured"
                ? "This server has not been provisioned for monitoring yet."
                : monitoringStatusQuery.data?.collectionError ||
                  (monitoringStatusQuery.data?.lastCollectedAt
                    ? `Last sample ${new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(
                        new Date(monitoringStatusQuery.data.lastCollectedAt),
                      )}`
                    : "Waiting for the first sample…")}
            </p>
          </div>
          <Badge
            variant={
              monitoringStatusQuery.data?.status === "healthy"
                ? "default"
                : monitoringStatusQuery.data?.status === "not_configured"
                  ? "secondary"
                  : "destructive"
            }
          >
            {monitoringStatusQuery.isPending
              ? "Checking…"
              : monitoringStatusQuery.data?.status === "healthy"
                ? "Healthy"
                : monitoringStatusQuery.data?.status === "not_configured"
                  ? "Not configured"
                  : "Needs attention"}
          </Badge>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Workload CPU"
          value={`${stats?.cpu ?? latest?.cpu ?? 0}%`}
          description={`${stats?.cpuCores ?? 0} host cores available`}
          icon={Cpu}
        />
        <StatCard
          label="Workload memory"
          value={`${stats?.memoryPercent ?? latest?.memory ?? 0}%`}
          description={`${formatBytes((stats?.memoryUsage ?? 0) * 1024 * 1024)} used`}
          icon={MemoryStick}
        />
        <StatCard
          label="Active containers"
          value={String(stats?.activeContainers ?? containers.length)}
          description="Running workloads"
          icon={Server}
        />
        <StatCard
          label="Docker storage"
          value={formatBytes(
            (stats?.dockerImageBytes ?? 0) +
              (stats?.dockerContainerBytes ?? 0) +
              (stats?.dockerVolumeBytes ?? 0),
          )}
          description="Images, containers, and volumes"
          icon={HardDrive}
        />
        <StatCard
          label="Host uptime"
          value={formatUptime(latest?.uptime ?? 0)}
          description={latest?.os ?? "Waiting for host metadata"}
          icon={Activity}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Alert thresholds</CardTitle>
          <CardDescription>
            Send a notification when host CPU or memory exceeds these values.
            Set a threshold to 0 to disable that alert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!activeOrganization?.id) return;
              updateMonitoringSettings.mutate({
                organizationId: activeOrganization.id,
                serverId: selectedServerId,
                cpuThreshold,
                memoryThreshold,
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="monitoring-cpu-threshold">
                CPU threshold (%)
              </Label>
              <Input
                id="monitoring-cpu-threshold"
                type="number"
                min={0}
                max={100}
                step={1}
                value={cpuThreshold}
                onChange={(event) =>
                  setCpuThreshold(Number(event.target.value))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monitoring-memory-threshold">
                Memory threshold (%)
              </Label>
              <Input
                id="monitoring-memory-threshold"
                type="number"
                min={0}
                max={100}
                step={1}
                value={memoryThreshold}
                onChange={(event) =>
                  setMemoryThreshold(Number(event.target.value))
                }
              />
            </div>
            <Button
              type="submit"
              disabled={
                updateMonitoringSettings.isPending ||
                monitoringSettingsQuery.isPending
              }
            >
              {updateMonitoringSettings.isPending ? (
                <Spinner />
              ) : (
                "Save thresholds"
              )}
            </Button>
          </form>
          {updateMonitoringSettings.error ? (
            <p className="mt-3 text-destructive text-sm" role="alert">
              {updateMonitoringSettings.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <MonitoringChart
          data={history}
          dataKeys={[
            { key: "cpu", color: "var(--color-primary)", name: "CPU" },
          ]}
          title="CPU utilization"
          description="Host CPU utilization collected by the monitoring agent."
        />
        <MonitoringChart
          data={history}
          dataKeys={[
            { key: "memory", color: "var(--color-chart-2)", name: "Memory" },
          ]}
          title="Memory utilization"
          description="Used memory as a percentage of total host memory."
        />
        <MonitoringChart
          data={history}
          dataKeys={[
            { key: "disk", color: "var(--color-chart-3)", name: "Disk" },
          ]}
          title="Disk utilization"
          description="Root filesystem utilization over the selected range."
        />
        <MonitoringChart
          data={history}
          dataKeys={[
            {
              key: "networkIn",
              color: "var(--color-chart-4)",
              name: "Received",
            },
            { key: "networkOut", color: "var(--color-chart-5)", name: "Sent" },
          ]}
          title="Network traffic"
          description="Cumulative network counters reported by the host."
          yAxisUnit=" MB"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" aria-hidden="true" />
            Container resource breakdown
          </CardTitle>
          <CardDescription>
            Latest persisted Docker metrics for the selected server. Empty rows
            are normal before the first collection cycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {containers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
              No container metrics are available in this range.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/30 text-left text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="p-3 font-medium">Container</th>
                    <th className="p-3 font-medium">CPU</th>
                    <th className="p-3 font-medium">Memory</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <ArrowDownToLine
                          className="size-3"
                          aria-hidden="true"
                        />
                        Network in
                      </span>
                    </th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpFromLine
                          className="size-3"
                          aria-hidden="true"
                        />
                        Network out
                      </span>
                    </th>
                    <th className="p-3 font-medium">Sampled</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((container) => (
                    <tr
                      key={`${container.ID}-${container.timestamp}`}
                      className="border-t"
                    >
                      <td
                        className="max-w-[260px] truncate p-3 font-medium"
                        title={container.Name}
                      >
                        {container.Name}
                      </td>
                      <td className="p-3 tabular-nums">
                        {container.CPU.toFixed(1)}%
                      </td>
                      <td className="p-3 tabular-nums">
                        {container.Memory.percentage.toFixed(1)}%
                      </td>
                      <td className="p-3 tabular-nums">
                        {container.Network.input} {container.Network.inputUnit}
                      </td>
                      <td className="p-3 tabular-nums">
                        {container.Network.output}{" "}
                        {container.Network.outputUnit}
                      </td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground text-xs">
                        {new Date(container.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-primary" aria-hidden="true" />
            Runtime details
          </CardTitle>
          <CardDescription>
            Host identity and current Docker workload counters.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">Operating system</p>
            <p className="mt-1 font-medium">
              {stats?.operatingSystem || latest?.os || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Kernel</p>
            <p className="mt-1 truncate font-medium" title={latest?.kernel}>
              {stats?.kernelVersion || latest?.kernel || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Architecture</p>
            <p className="mt-1 font-medium">
              {stats?.architecture || latest?.arch || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Docker engine</p>
            <p className="mt-1 truncate font-medium" title={stats?.serverName}>
              {stats?.serverName || latest?.cpuModel || "Unknown"}
            </p>
          </div>
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
