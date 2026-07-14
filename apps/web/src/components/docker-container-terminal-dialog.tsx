"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TerminalEmulator } from "@/components/shared/terminal-emulator";
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) disconnect();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex h-[min(92svh,820px)] w-[calc(100vw-1rem)] max-w-[min(96vw,1120px)] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0">
        <DialogHeader className="border-border/60 border-b bg-muted/20 px-4 py-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              className="size-5 text-primary"
            />
            Docker container terminal
          </DialogTitle>
          <DialogDescription>
            Interactive terminal for container{" "}
            <span className="font-mono font-semibold text-foreground">
              {container?.name}
            </span>{" "}
            on {isLocal ? "Local Docker" : "the selected remote server"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 border-border/60 border-b bg-background p-4">
          {isLocal ? (
            <Select
              items={keys.map((key) => ({
                value: key.id,
                label: `${key.name} · ${key.fingerprint}`,
              }))}
              value={keyId}
              onValueChange={(value) => setKeyId(value ?? "")}
            >
              <SelectTrigger className="min-w-64">
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
          <Button onClick={connect} disabled={connecting || token !== null}>
            {connecting
              ? "Connecting…"
              : token !== null
                ? "Connected"
                : "Connect"}
          </Button>
          <Button
            variant="outline"
            onClick={disconnect}
            disabled={token === null}
          >
            Disconnect
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#080c0a] p-1">
          {token ? (
            <TerminalEmulator token={token} onClose={disconnect} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              {connecting
                ? "Initializing terminal session..."
                : "Click Connect to start interactive terminal session"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
