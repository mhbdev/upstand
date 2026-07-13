"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricPoint = {
  time: string;
  cpu: number;
  ram: number;
  ramUsage: number;
  networkRxBytes: number;
  networkTxBytes: number;
};

interface MonitoringTabProps {
  statsData?: {
    collectedAt?: string;
    cpu?: number | null;
    ram?: number | null;
    ramUsage?: number | null;
    cpuPercent?: number | null;
    memoryPercent?: number | null;
    memoryUsageBytes?: number | null;
    containerCount?: number | null;
    networkRxBytes?: number | null;
    networkTxBytes?: number | null;
  } | null;
}

function finiteMetric(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function MonitoringTab({ statsData }: MonitoringTabProps) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);

  useEffect(() => {
    if (!statsData) return;
    const collectedAt = new Date(statsData.collectedAt ?? Date.now());
    const cpu = finiteMetric(statsData.cpu ?? statsData.cpuPercent);
    const ram = finiteMetric(statsData.ram ?? statsData.memoryPercent);
    const metric: MetricPoint = {
      time: (Number.isNaN(collectedAt.getTime())
        ? new Date()
        : collectedAt
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      cpu: Number(cpu.toFixed(1)),
      ram: Number(ram.toFixed(1)),
      ramUsage: finiteMetric(statsData.ramUsage ?? statsData.memoryUsageBytes),
      networkRxBytes: finiteMetric(statsData.networkRxBytes),
      networkTxBytes: finiteMetric(statsData.networkTxBytes),
    };
    setMetrics((current) => [...current.slice(-30), metric]);
  }, [statsData]);

  return (
    <Card className="border border-border/40 bg-card/20">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="font-semibold text-lg">
            Live Resource Metrics
          </CardTitle>
          <CardDescription className="font-normal text-muted-foreground text-sm">
            Real Docker statistics aggregated across{" "}
            {statsData?.containerCount ?? 0} active container replicas. History
            starts when this tab is opened.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 border-border/20 border-t pt-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* CPU usage */}
          <Card className="border border-border/40 bg-card p-4">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Workload CPU (%)
              </CardTitle>
            </CardHeader>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={metrics}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-primary)"
                        stopOpacity={0.3}
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
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="var(--color-primary)"
                    fillOpacity={1}
                    fill="url(#cpuGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* RAM usage */}
          <Card className="border border-border/40 bg-card p-4">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Memory Utilization (%)
              </CardTitle>
            </CardHeader>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={metrics}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-chart-2)"
                        stopOpacity={0.3}
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
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ram"
                    stroke="var(--color-chart-2)"
                    fillOpacity={1}
                    fill="url(#ramGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
