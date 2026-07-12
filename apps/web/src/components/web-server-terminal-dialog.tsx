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
import { env } from "@upstand/env/web";
import { trpc } from "@/utils/trpc";

function apiUrl(path: string) {
  return new URL(path, env.NEXT_PUBLIC_SERVER_URL).toString();
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
      };
      ws.onclose = (event) => {
        setOutput(
          (value) =>
            `${value}\r\n[Disconnected: ${event.reason || "connection closed"}]\r\n`,
        );
        setConnecting(false);
      };
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Terminal connection failed",
      );
      setConnecting(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-border/60 bg-background p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              className="size-5 text-primary"
            />
            Control-plane terminal
          </DialogTitle>
          <DialogDescription>
            SSH uses the selected encrypted key. The private key never leaves
            the server.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto_auto_auto]">
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
          />
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-label="SSH port"
          />
          <Button onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect"}
          </Button>
        </div>
        <pre
          ref={outputRef}
          className="mx-6 h-[440px] overflow-auto rounded-lg border bg-black p-4 font-mono text-sm leading-6 text-emerald-300"
        >
          {output}
        </pre>
        <form onSubmit={send} className="flex gap-2 p-6 pt-4">
          <Label className="sr-only" htmlFor="terminal-command">
            Command
          </Label>
          <Input
            id="terminal-command"
            autoComplete="off"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter a command"
            disabled={socket.current?.readyState !== WebSocket.OPEN}
          />
          <Button
            type="submit"
            disabled={!command || socket.current?.readyState !== WebSocket.OPEN}
          >
            Run
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
