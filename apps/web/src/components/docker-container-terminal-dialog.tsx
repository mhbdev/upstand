"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TerminalDialogShell } from "@/components/shared/terminal-dialog-shell";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

function apiUrl(path: string) {
  return new URL(path, getServerUrl()).toString();
}

export function DockerContainerTerminalDialog({
  open,
  onOpenChange,
  organizationId,
  serverId,
  container,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  organizationId: string;
  serverId: string;
  container: { id: string; name: string } | null;
}) {
  const isLocal = serverId === "local";
  const { data: keys = [] } = useQuery({
    ...trpc.sshKey.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId && open && isLocal),
  });
  const [keyId, setKeyId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!open) {
      setToken(null);
    }
  }, [open]);

  const disconnect = () => {
    setToken(null);
  };

  const connect = async () => {
    if (!container) return;
    if (isLocal && !keyId) return toast.error("Choose an SSH key first");
    setConnecting(true);
    try {
      const response = await fetch(apiUrl("/api/docker/terminal/session"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          serverId,
          containerId: container.id,
          ...(isLocal ? { sshKeyId: keyId } : {}),
        }),
      });
      const data = (await response.json()) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.token) {
        throw new Error(data.error || "Unable to open Docker terminal");
      }
      setToken(data.token);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Docker terminal failed",
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <TerminalDialogShell
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) disconnect();
        onOpenChange(nextOpen);
      }}
      title="Docker container terminal"
      description={
        <>
          Interactive terminal for container{" "}
          <span className="font-mono font-semibold text-foreground">
            {container?.name}
          </span>{" "}
          on {isLocal ? "Local Docker" : "the selected remote server"}.
        </>
      }
      token={token}
      connecting={connecting}
      emptyMessage="Click Connect to start an interactive terminal session"
      onTerminalClose={disconnect}
      controls={
        <>
          {isLocal ? (
            <Select
              items={keys.map((key) => ({
                value: key.id,
                label: `${key.name} · ${key.fingerprint}`,
              }))}
              value={keyId}
              onValueChange={(value) => setKeyId(value ?? "")}
            >
              <SelectTrigger className="min-w-0 flex-1 sm:min-w-64 sm:flex-none">
                <SelectValue placeholder="SSH key" />
              </SelectTrigger>
              <SelectContent>
                {keys.map((key) => (
                  <SelectItem key={key.id} value={key.id}>
                    {key.name} · {key.fingerprint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            className="flex-1 sm:flex-none"
            onClick={connect}
            disabled={connecting || token !== null}
          >
            {connecting
              ? "Connecting…"
              : token !== null
                ? "Connected"
                : "Connect"}
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            variant="outline"
            onClick={disconnect}
            disabled={token === null}
          >
            Disconnect
          </Button>
        </>
      }
    />
  );
}
