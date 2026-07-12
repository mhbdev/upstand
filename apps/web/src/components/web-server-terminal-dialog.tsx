"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { getServerUrl } from "@/lib/server-url";

function apiUrl(path: string) {
  return new URL(path, getServerUrl()).toString();
}

export function WebServerTerminalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { data: organization } = authClient.useActiveOrganization();
  const { data: keys = [] } = useQuery({
    ...trpc.sshKey.list.queryOptions({
      organizationId: organization?.id || "",
    }),
    enabled: Boolean(organization?.id && open),
  });
  const [keyId, setKeyId] = useState("");
  const [username, setUsername] = useState("root");
  const [port, setPort] = useState("22");
  const [output, setOutput] = useState(
    "Select an SSH key authorized on the control-plane server, then connect.\r\n",
  );
  const [command, setCommand] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => () => socket.current?.close(), []);
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [output]);

  const connect = async () => {
    if (!organization?.id || !keyId)
      return toast.error("Choose an SSH key first");
    setConnecting(true);
    try {
      const response = await fetch(apiUrl("/api/terminal/session"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          sshKeyId: keyId,
          username,
          port: Number(port),
        }),
      });
      const data = (await response.json()) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.token)
        throw new Error(data.error || "Unable to create terminal session");
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
        toast.error("Terminal connection failed");
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
        error instanceof Error ? error.message : "Terminal connection failed",
      );
      setConnecting(false);
      setConnected(false);
    }
  };
  const disconnect = () => {
    socket.current?.close(1000, "Closed by operator");
    socket.current = null;
    setConnected(false);
  };
  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (command && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(`${command}\n`);
      setCommand("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden border-border/60 bg-background p-0">
        <DialogHeader className="border-border/60 border-b bg-muted/20 px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              className="size-5 text-primary"
            />
            Control-plane terminal
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            SSH uses the selected encrypted key. The private key never leaves
            the server.
            <span className="rounded-full border px-2 py-0.5 font-medium text-[11px]">
              {connected
                ? "Connected"
                : connecting
                  ? "Connecting"
                  : "Disconnected"}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 border-border/60 border-b bg-background p-4 md:grid-cols-[minmax(0,1fr)_9rem_6rem_auto_auto]">
          <Select
            items={keys.map((key) => ({
              value: key.id,
              label: `${key.name} · ${key.fingerprint}`,
            }))}
            value={keyId}
            onValueChange={(value) => setKeyId(value ?? "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="SSH key" />
            </SelectTrigger>
            <SelectContent>
              {keys.map(
                (key: { id: string; name: string; fingerprint: string }) => (
                  <SelectItem key={key.id} value={key.id}>
                    {key.name} · {key.fingerprint}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-label="SSH username"
            placeholder="Username"
          />
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-label="SSH port"
            placeholder="Port"
          />
          <Button onClick={connect} disabled={connecting || connected}>
            {connecting ? "Connecting…" : "Connect"}
          </Button>
          <Button variant="outline" onClick={disconnect} disabled={!connected}>
            Disconnect
          </Button>
        </div>
        <div className="bg-[#0b0f0d] p-4">
          <pre
            ref={outputRef}
            className="h-[min(56vh,520px)] overflow-auto rounded-md border border-emerald-500/20 bg-black p-4 font-mono text-[13px] leading-6 text-emerald-300 shadow-inner"
          >
            {output}
          </pre>
        </div>
        <form
          onSubmit={send}
          className="flex gap-2 border-border/60 border-t bg-muted/10 p-4"
        >
          <Label className="sr-only" htmlFor="terminal-command">
            Command
          </Label>
          <Input
            id="terminal-command"
            autoComplete="off"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter a command"
            disabled={!connected}
          />
          <Button type="submit" disabled={!command || !connected}>
            Run
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
