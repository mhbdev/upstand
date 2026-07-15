"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@upstand/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Spinner } from "@upstand/ui/components/spinner";
import { type ReactNode, useState } from "react";
import { TerminalEmulator } from "./terminal-emulator";

export function TerminalDialogShell({
  open,
  onOpenChange,
  title,
  description,
  controls,
  token,
  connecting = false,
  emptyMessage,
  appearance = "standard",
  terminalLabel = "Interactive shell",
  onTerminalReady,
  onTerminalClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  controls: ReactNode;
  token: string | null;
  connecting?: boolean;
  emptyMessage: string;
  appearance?: "standard" | "control-plane";
  terminalLabel?: string;
  onTerminalReady?: () => void;
  onTerminalClose: (reason?: string) => void;
}) {
  const [readyToken, setReadyToken] = useState<string | null>(null);
  const terminalReady = Boolean(token && readyToken === token);
  const terminalConnecting = connecting || Boolean(token && !terminalReady);
  const handleTerminalReady = () => {
    setReadyToken(token);
    onTerminalReady?.();
  };

  if (appearance === "standard") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(92svh,820px)] w-[calc(100%-1rem)] max-w-[min(96vw,70rem)] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0 sm:w-[calc(100%-2rem)]">
          <DialogHeader className="shrink-0 border-border/60 border-b bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <HugeiconsIcon
                icon={TerminalIcon}
                className="size-5 shrink-0 text-primary"
              />
              <span className="truncate">{title}</span>
            </DialogTitle>
            <DialogDescription className="break-words">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-border/60 border-b bg-background p-3 sm:p-4">
            {controls}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-[#080c0a] p-1">
            {token ? (
              <TerminalEmulator
                token={token}
                onReady={handleTerminalReady}
                onClose={onTerminalClose}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
                {connecting ? "Initializing terminal session…" : emptyMessage}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92svh,800px)] w-[calc(100%-1rem)] max-w-[min(96vw,64rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
        <DialogHeader className="shrink-0 px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-16">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <HugeiconsIcon icon={TerminalIcon} className="text-primary" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-lg">{title}</DialogTitle>
                {terminalReady ? (
                  <Badge>Connected</Badge>
                ) : terminalConnecting ? (
                  <Badge variant="secondary">
                    <Spinner data-icon="inline-start" />
                    Connecting
                  </Badge>
                ) : (
                  <Badge variant="outline">Not connected</Badge>
                )}
              </div>
              <DialogDescription className="max-w-2xl leading-relaxed">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <section
          aria-label="Connection settings"
          className="shrink-0 border-border/60 border-y bg-muted/20 px-5 py-4 sm:px-7"
        >
          {controls}
        </section>

        <div className="min-h-0 flex-1 bg-muted/20 p-3 sm:p-4">
          <div className="flex h-full min-h-64 flex-col overflow-hidden rounded-2xl bg-[#080c0a] shadow-sm ring-1 ring-foreground/10">
            <div className="flex h-10 shrink-0 items-center gap-2 border-white/10 border-b bg-[#0d1210] px-3.5 text-xs">
              <HugeiconsIcon icon={TerminalIcon} className="text-emerald-400" />
              <span className="truncate font-mono text-slate-400">
                {terminalLabel}
              </span>
              <span className="ml-auto font-mono text-slate-500">
                {terminalReady
                  ? "live"
                  : terminalConnecting
                    ? "opening…"
                    : "offline"}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {token ? (
                <TerminalEmulator
                  token={token}
                  onReady={handleTerminalReady}
                  onClose={onTerminalClose}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 font-mono text-emerald-400 text-lg">
                    $_
                  </div>
                  <div className="flex max-w-sm flex-col gap-1">
                    <p className="font-medium text-slate-300 text-sm">
                      Terminal is offline
                    </p>
                    <p className="text-slate-500 text-sm">{emptyMessage}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
