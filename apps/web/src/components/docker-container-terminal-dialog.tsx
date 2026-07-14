"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open) {
      setOutput(`Opening terminal for ${container?.name ?? "container"}…\r\n`);
    }
  }, [open, container?.name]);
  useEffect(() => () => socket.current?.close(), []);
  // The output value intentionally triggers scrolling as terminal chunks arrive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: output updates drive terminal auto-scroll.
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [output]);

  const disconnect = () => {
    socket.current?.close(1000, "Closed by operator");
    socket.current = null;
    setConnected(false);
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
      const url = new URL(apiUrl(`/api/terminal/connect?token=${data.token}`));
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        setOutput((value) => `${value}\r\nConnected.\r\n`);
        setConnecting(false);
        setConnected(true);
      };
      ws.onmessage = async (event) => {
        const text =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(
                event.data instanceof Blob
                  ? await event.data.arrayBuffer()
                  : event.data,
              );
        setOutput((value) => `${value}${text}`);
      };
      ws.onerror = () => {
        toast.error("Docker terminal connection failed");
        setConnecting(false);
        setConnected(false);
      };
      ws.onclose = (event) => {
        setOutput(
          (value) =>
            `${value}\r\n[Disconnected: ${event.reason || "connection closed"}]\r\n`,
        );
        setConnecting(false);
        setConnected(false);
      };
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Docker terminal failed",
      );
      setConnecting(false);
      setConnected(false);
    }
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (command && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(`${command}\n`);
      setCommand("");
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
      <DialogContent className="h-[min(92svh,820px)] w-[calc(100vw-1rem)] max-w-[min(96vw,1120px)] gap-0 overflow-hidden border-border/60 bg-background p-0">
        <DialogHeader className="border-border/60 border-b bg-muted/20 px-4 py-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              className="size-5 text-primary"
            />
            Docker container terminal
          </DialogTitle>
          <DialogDescription>
            {container?.name} on{" "}
            {isLocal ? "Local Docker" : "the selected remote server"}. The
            private key never leaves the server.
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
          <Button onClick={connect} disabled={connecting || connected}>
            {connecting ? "Connecting…" : "Connect"}
          </Button>
          <Button variant="outline" onClick={disconnect} disabled={!connected}>
            Disconnect
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#0b0f0d] p-3 sm:p-4">
          <pre
            ref={outputRef}
            aria-live="polite"
            className="h-full min-h-52 overflow-auto rounded-md border border-border/40 bg-muted/30 p-3 font-mono text-[12px] text-foreground leading-6 shadow-inner"
          >
            {output}
          </pre>
        </div>
        <form
          onSubmit={send}
          className="flex gap-2 border-border/60 border-t bg-muted/10 p-3 sm:p-4"
        >
          <Input
            autoComplete="off"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Enter a command"
            disabled={!connected}
          />
          <DialogFooter>
            <Button type="submit" disabled={!command || !connected}>
              Run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
