"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@upstand/ui/components/popover";
import { Spinner } from "@upstand/ui/components/spinner";
import { cn } from "@upstand/ui/lib/utils";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";
import { Check } from "@/components/huge-icons";
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
  const { resolvedTheme } = useTheme();
  const [readyToken, setReadyToken] = useState<string | null>(null);
  const terminalReady = Boolean(token && readyToken === token);
  const terminalConnecting = connecting || Boolean(token && !terminalReady);

  const [themeName, setThemeName] = useState<
    "auto" | "slate" | "matrix" | "dracula" | "light"
  >("auto");
  const [fontSize, setFontSize] = useState<number>(13);
  const [clearTrigger, setClearTrigger] = useState<number>(0);
  const [downloadTrigger, setDownloadTrigger] = useState<number>(0);

  const activeTheme =
    themeName === "auto"
      ? resolvedTheme === "light"
        ? "light"
        : "slate"
      : themeName;

  const handleTerminalReady = () => {
    setReadyToken(token);
    onTerminalReady?.();
  };

  const handleTerminalClose = (reason?: string) => {
    setReadyToken(null);
    onTerminalClose(reason);
  };

  // Shared Terminal Sub-Toolbar for both layouts
  const renderTerminalToolbar = () => {
    if (!token) return null;
    return (
      <div className="flex h-9 shrink-0 select-none flex-wrap items-center gap-1.5 border-border/40 border-b bg-muted/60 px-3.5 font-mono text-xs dark:bg-[#0d1210]">
        <HugeiconsIcon
          icon={TerminalIcon}
          className="size-3.5 shrink-0 text-primary"
        />
        <span className="max-w-[120px] truncate font-semibold text-[11px] text-foreground/80 sm:max-w-none">
          {terminalLabel}
        </span>
        <span className="ml-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Font Size controls */}
        <div className="flex items-center gap-1 rounded border border-border/30 bg-background/60 px-1.5 py-0.5 dark:border-white/5 dark:bg-white/5">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[9px] text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            aria-label="Decrease font size"
          >
            A-
          </Button>
          <span className="min-w-4 text-center font-bold text-[9px] text-foreground tabular-nums">
            {fontSize}px
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[9px] text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setFontSize((s) => Math.min(20, s + 1))}
            aria-label="Increase font size"
          >
            A+
          </Button>
        </div>

        <div className="mx-0.5 h-4 w-px bg-border/40" />

        {/* Theme selection */}
        <Popover>
          <PopoverTrigger className="inline-flex h-6 cursor-pointer items-center justify-center gap-1 rounded border border-border/30 bg-background/60 px-2 font-medium text-[9px] text-muted-foreground transition-colors hover:text-foreground dark:border-white/5 dark:bg-white/5">
            <span className="capitalize">Theme: {themeName}</span>
          </PopoverTrigger>
          <PopoverContent
            className="w-32 border-border/40 bg-card p-1 text-card-foreground"
            align="end"
          >
            {(["auto", "slate", "matrix", "dracula", "light"] as const).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setThemeName(t)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1 text-left text-[10px] transition-colors hover:bg-muted/50",
                    themeName === t && "bg-primary/10 font-bold text-primary",
                  )}
                >
                  <span className="capitalize">{t}</span>
                  {themeName === t && <Check className="size-3" />}
                </button>
              ),
            )}
          </PopoverContent>
        </Popover>

        <div className="mx-0.5 h-4 w-px bg-border/40" />

        {/* Action Buttons */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[9px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => setClearTrigger((c) => c + 1)}
          aria-label="Clear screen"
        >
          Clear
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[9px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => setDownloadTrigger((d) => d + 1)}
          aria-label="Download terminal log buffer"
        >
          Download Buffer
        </Button>
      </div>
    );
  };

  if (appearance === "standard") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(92svh,820px)] w-[calc(100%-1rem)] max-w-[min(96vw,84rem)] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0 sm:w-[calc(100%-2rem)]">
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
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden p-1 transition-colors",
              activeTheme === "light" ? "bg-slate-100" : "bg-[#080c0a]",
            )}
          >
            {renderTerminalToolbar()}
            <div className="relative min-h-0 flex-1">
              {token ? (
                <TerminalEmulator
                  token={token}
                  themeName={activeTheme}
                  fontSize={fontSize}
                  clearTrigger={clearTrigger}
                  downloadTrigger={downloadTrigger}
                  onReady={handleTerminalReady}
                  onClose={handleTerminalClose}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
                  {connecting ? (
                    <div className="flex flex-col items-center gap-2">
                      <Spinner className="size-6 animate-pulse text-primary" />
                      <span>Initializing terminal session…</span>
                    </div>
                  ) : (
                    emptyMessage
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92svh,800px)] w-[calc(100%-1rem)] max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
        <DialogHeader className="shrink-0 px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-16">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <HugeiconsIcon icon={TerminalIcon} className="text-primary" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-lg">{title}</DialogTitle>
                {terminalReady ? (
                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10">
                    Connected
                  </Badge>
                ) : terminalConnecting ? (
                  <Badge variant="secondary" className="animate-pulse">
                    <Spinner
                      data-icon="inline-start"
                      className="mr-1.5 size-3"
                    />
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
          <div
            className={cn(
              "flex h-full min-h-64 flex-col overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/40 transition-colors",
              activeTheme === "light" ? "bg-slate-100" : "bg-[#080c0a]",
            )}
          >
            {renderTerminalToolbar()}

            {/* Offline state header fallback */}
            {!token && (
              <div className="flex h-10 shrink-0 items-center gap-2 border-white/10 border-b bg-[#0d1210] px-3.5 text-xs">
                <HugeiconsIcon icon={TerminalIcon} className="text-slate-400" />
                <span className="truncate font-mono text-slate-400">
                  {terminalLabel}
                </span>
                <span className="ml-auto font-mono text-slate-500">
                  {terminalConnecting ? "opening…" : "offline"}
                </span>
              </div>
            )}

            <div className="relative min-h-0 flex-1 overflow-hidden">
              {token ? (
                <TerminalEmulator
                  token={token}
                  themeName={activeTheme}
                  fontSize={fontSize}
                  clearTrigger={clearTrigger}
                  downloadTrigger={downloadTrigger}
                  onReady={handleTerminalReady}
                  onClose={handleTerminalClose}
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
                    <p className="text-slate-500 text-xs leading-normal">
                      {emptyMessage}
                    </p>
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
