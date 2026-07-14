"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import { Input } from "@upstand/ui/components/input";
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
import { authClient } from "@/lib/auth-client";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

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
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!open) {
      setToken(null);
    }
  }, [open]);

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
      setToken(data.token);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Terminal connection failed",
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setToken(null);
  };

  return (
    <TerminalDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Control-plane terminal"
      description={
        <>
          SSH session connected to control-plane server via selected encrypted
          key.
        </>
      }
      token={token}
      connecting={connecting}
      emptyMessage="Configure a key, port, then click Connect"
      onTerminalClose={disconnect}
      controls={
        <div className="grid w-full min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_6rem_auto_auto]">
          <Select
            items={keys.map((key) => ({
              value: key.id,
              label: `${key.name} · ${key.fingerprint}`,
            }))}
            value={keyId}
            onValueChange={(value) => setKeyId(value ?? "")}
          >
            <SelectTrigger className="min-w-0">
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
          <Button
            className="w-full"
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
            className="w-full"
            variant="outline"
            onClick={disconnect}
            disabled={token === null}
          >
            Disconnect
          </Button>
        </div>
      }
    />
  );
}
