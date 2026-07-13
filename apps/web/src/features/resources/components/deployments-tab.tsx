"use client";

import { useMutation } from "@tanstack/react-query";
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
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { cn } from "@upstand/ui/lib/utils";
import { Eye, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

type DeploymentItem = {
  id: string;
  status: string;
  title: string;
  logs: string;
  createdAt: string;
};

interface DeploymentsTabProps {
  resource: any;
  updateResource: any;
  deployResource: any;
  isDeployingResource: boolean;
}

const parseDeploymentItems = (
  value: string | null | undefined,
): DeploymentItem[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const id = typeof item.id === "string" ? item.id : undefined;
      if (!id) return [];
      return [
        {
          id,
          status: typeof item.status === "string" ? item.status : "unknown",
          title: typeof item.title === "string" ? item.title : "Deployment",
          logs: typeof item.logs === "string" ? item.logs : "",
          createdAt:
            typeof item.createdAt === "string"
              ? item.createdAt
              : new Date(0).toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
};

export function DeploymentsTab({
  resource,
  updateResource,
  deployResource,
  isDeployingResource,
}: DeploymentsTabProps) {
  const [deployList, setDeployList] = useState<DeploymentItem[]>([]);
  const [selectedDeployment, setSelectedDeployment] =
    useState<DeploymentItem | null>(null);
  const [viewDeploymentLogsOpen, setViewDeploymentLogsOpen] = useState(false);

  useEffect(() => {
    if (resource) {
      setDeployList(parseDeploymentItems(resource.deployments));
    }
  }, [resource]);

  const isBuilding = deployList.some((d) => d.status === "running");
  const queuedDeployment = deployList.find((deployment) =>
    ["queued", "waiting"].includes(deployment.status),
  );
  const cancelDeploymentMutation = useMutation({
    ...trpc.deployment.cancelDeploymentJob.mutationOptions(),
    onSuccess: () => {
      if (!queuedDeployment) return;
      setDeployList((current) =>
        current.map((deployment) =>
          deployment.id === queuedDeployment.id
            ? {
                ...deployment,
                status: "failed",
                logs: `${deployment.logs}\nDeployment cancelled by user.\n`,
              }
            : deployment,
        ),
      );
      toast.success("Queued deployment cancelled");
    },
    onError: (error) => toast.error(error.message),
  });

  const triggerDeployment = () => {
    toast.info("Building and deploying resource...");
    deployResource({ id: resource.id });
  };

  const clearDeployments = () => {
    updateResource(
      { id: resource.id, deployments: "[]" },
      {
        onSuccess: () => {
          setDeployList([]);
          toast.success("Deployment history cleared");
        },
      },
    );
  };

  const getWebhookUrl = () => {
    if (typeof window !== "undefined") {
      return `${getServerUrl()}/api/deploy/rc-${resource.id}`;
    }
    return "";
  };

  const handleCopyWebhook = () => {
    const url = getWebhookUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied to clipboard");
    }
  };

  return (
    <>
      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            Deployment Webhook & Trigger
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Manually build or setup external CI trigger pipelines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 border-border/20 border-t pt-4">
          <div className="space-y-2">
            <Label>Auto Deploy Webhook Endpoint URL</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={getWebhookUrl()}
                className="select-all border-border/40 bg-muted/20 font-mono text-foreground text-xs"
              />
              <Button
                onClick={handleCopyWebhook}
                variant="outline"
                className="border-border/40"
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={triggerDeployment}
              disabled={isBuilding || isDeployingResource}
              className="gap-2 font-medium"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  (isBuilding || isDeployingResource) && "animate-spin",
                )}
              />
              Deploy Now
            </Button>
            <Button
              onClick={clearDeployments}
              variant="outline"
              className="gap-2 border-border/40"
            >
              <Trash2 className="size-4" /> Clear Deployments
            </Button>
            <Button
              onClick={() => {
                if (!queuedDeployment) return;
                cancelDeploymentMutation.mutate({
                  serverId: resource.serverId ?? "local",
                  jobId: queuedDeployment.id,
                });
              }}
              variant="outline"
              className="gap-2 border-border/40"
              disabled={!queuedDeployment || cancelDeploymentMutation.isPending}
            >
              {cancelDeploymentMutation.isPending
                ? "Cancelling..."
                : "Cancel Queued Deployment"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            Deployment History (Max 10)
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Audit trail of recent project builds.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-border/20 border-t pt-4">
          {deployList.length > 0 ? (
            <div className="overflow-hidden border border-border/20 bg-card/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                    <th className="p-3">Deployment ID</th>
                    <th className="p-3">Pipeline Status</th>
                    <th className="p-3">Trigger Time</th>
                    <th className="p-3 text-center">Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {deployList.map((dep) => (
                    <tr
                      key={dep.id}
                      className="border-border/10 border-b hover:bg-muted/5"
                    >
                      <td className="p-3 font-mono font-semibold text-foreground text-xs">
                        {dep.id}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 font-semibold text-xs",
                            dep.status === "success"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {dep.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(dep.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          onClick={() => {
                            setSelectedDeployment(dep);
                            setViewDeploymentLogsOpen(true);
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 font-medium text-xs hover:bg-accent"
                        >
                          <Eye className="size-3.5" /> Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No deployment history found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deployment build logs modal */}
      <Dialog
        open={viewDeploymentLogsOpen}
        onOpenChange={setViewDeploymentLogsOpen}
      >
        <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,56rem)] rounded-2xl border border-border bg-card font-mono shadow-2xl sm:min-w-[min(42rem,calc(100vw-2rem))]">
          <DialogHeader className="border-border border-b pb-3">
            <DialogTitle className="font-semibold text-foreground">
              Build & Deploy Logs: {selectedDeployment?.id}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Generated on{" "}
              {selectedDeployment &&
                new Date(selectedDeployment.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 select-text overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 p-4 font-mono text-foreground text-xs leading-relaxed">
            {selectedDeployment?.logs || "No logs available."}
          </div>
          <DialogFooter className="border-border border-t pt-3">
            <Button
              onClick={() => setViewDeploymentLogsOpen(false)}
              variant="outline"
            >
              Close Logs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
